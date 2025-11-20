"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const response = require("../utils/response");
const validation = require("../utils/validation");

/**
 * USERS HANDLER
 * =============
 * Gestion des profils utilisateurs
 *
 * Fonctionnalités:
 * - Récupération du profil utilisateur
 * - Mise à jour du profil (nom, bio, etc.)
 */

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE;

/**
 * GET PROFILE - Récupérer le profil d'un utilisateur
 * GET /users/{userId}
 *
 * Accessible publiquement pour permettre de voir les auteurs
 * Les données sensibles sont filtrées
 */
module.exports.getProfile = async (event) => {
  console.log("=== GET USER PROFILE ===");

  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return response.badRequest("User ID is required");
    }

    // Récupérer l'utilisateur
    const result = await dynamodb.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId: userId },
      })
    );

    if (!result.Item) {
      return response.notFound("User not found");
    }

    const user = result.Item;

    // Filtrer les données sensibles
    const { passwordHash, passwordSalt, ...publicProfile } = user;

    console.log(`Profile retrieved for user: ${userId}`);

    return response.ok({
      user: publicProfile,
    });
  } catch (error) {
    console.error("Error in getProfile:", error);
    return response.handleError(error);
  }
};

/**
 * UPDATE PROFILE - Mettre à jour le profil utilisateur
 * PUT /users/{userId}
 *
 * Nécessite authentification
 * Un utilisateur ne peut modifier que son propre profil (sauf admin)
 *
 * Body:
 * {
 *   "name": "New Name",
 *   "bio": "My bio",
 *   "avatarUrl": "https://..."
 * }
 */
module.exports.updateProfile = async (event) => {
  console.log("=== UPDATE USER PROFILE ===");

  try {
    const userId = event.pathParameters?.userId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!userId) {
      return response.badRequest("User ID is required");
    }

    // Vérification d'autorisation
    // Un utilisateur peut modifier son propre profil, ou un admin peut modifier n'importe quel profil
    if (userId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only update your own profile");
    }

    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validateProfileUpdate(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Vérifier que l'utilisateur existe
    const existingUser = await dynamodb.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId: userId },
      })
    );

    if (!existingUser.Item) {
      return response.notFound("User not found");
    }

    // Construire l'expression de mise à jour dynamiquement
    const updates = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (body.name) {
      updates.push("#name = :name");
      expressionAttributeNames["#name"] = "name";
      expressionAttributeValues[":name"] = validation.sanitizeString(body.name);
    }

    if (body.bio !== undefined) {
      updates.push("bio = :bio");
      expressionAttributeValues[":bio"] = validation.sanitizeString(body.bio);
    }

    if (body.avatarUrl) {
      updates.push("avatarUrl = :avatarUrl");
      expressionAttributeValues[":avatarUrl"] = body.avatarUrl;
    }

    // Toujours mettre à jour updatedAt
    updates.push("updatedAt = :updatedAt");
    expressionAttributeValues[":updatedAt"] = new Date().toISOString();

    if (updates.length === 1) {
      // Seulement updatedAt, aucune vraie mise à jour
      return response.badRequest("No valid fields to update");
    }

    // Mettre à jour l'utilisateur
    const updateResult = await dynamodb.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: userId },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const updatedUser = updateResult.Attributes;

    // Filtrer les données sensibles
    const { passwordHash, passwordSalt, ...publicProfile } = updatedUser;

    console.log(`Profile updated for user: ${userId}`);

    return response.ok({
      message: "Profile updated successfully",
      user: publicProfile,
    });
  } catch (error) {
    console.error("Error in updateProfile:", error);
    return response.handleError(error);
  }
};
