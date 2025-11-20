"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const response = require("../utils/response");
const validation = require("../utils/validation");

/**
 * COMMENTS HANDLER
 * ================
 * Gestion des commentaires sur les articles de blog (Feature optionnelle)
 *
 * Fonctionnalités:
 * - Création de commentaires
 * - Récupération des commentaires d'un article
 * - Mise à jour de commentaires
 * - Suppression de commentaires
 * - Modération des commentaires (admin)
 */

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const COMMENTS_TABLE = process.env.COMMENTS_TABLE;
const POSTS_TABLE = process.env.POSTS_TABLE;

/**
 * CREATE COMMENT - Créer un commentaire sur un article
 * POST /posts/{postId}/comments
 *
 * Nécessite authentification
 *
 * Body:
 * {
 *   "content": "Great article!"
 * }
 */
module.exports.createComment = async (event) => {
  console.log("=== CREATE COMMENT ===");

  try {
    const postId = event.pathParameters?.postId;
    const userId = event.requestContext?.authorizer?.userId;
    const userName = event.requestContext?.authorizer?.name;

    if (!postId) {
      return response.badRequest("Post ID is required");
    }

    // Vérifier que le post existe
    const postResult = await dynamodb.send(
      new GetCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
      })
    );

    if (!postResult.Item) {
      return response.notFound("Post not found");
    }

    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validateComment(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Création du commentaire
    const commentId = uuidv4();
    const now = new Date().toISOString();

    const comment = {
      commentId: commentId,
      postId: postId,
      userId: userId,
      userName: userName,
      content: validation.sanitizeString(body.content),
      status: "pending", // pending, approved, rejected
      createdAt: now,
      updatedAt: now,
    };

    // Sauvegarder dans DynamoDB
    await dynamodb.send(
      new PutCommand({
        TableName: COMMENTS_TABLE,
        Item: comment,
      })
    );

    console.log(`Comment created: ${commentId} on post: ${postId}`);

    return response.created({
      message: "Comment created successfully",
      comment: comment,
    });
  } catch (error) {
    console.error("Error in createComment:", error);
    return response.handleError(error);
  }
};

/**
 * GET COMMENTS - Récupérer tous les commentaires d'un article
 * GET /posts/{postId}/comments?status=approved&limit=50
 *
 * Public (mais filtre par défaut sur commentaires approuvés)
 */
module.exports.getComments = async (event) => {
  console.log("=== GET COMMENTS ===");

  try {
    const postId = event.pathParameters?.postId;
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status || "approved"; // Par défaut: commentaires approuvés
    const limit = parseInt(queryParams.limit) || 50;

    if (!postId) {
      return response.badRequest("Post ID is required");
    }

    // Query avec index PostIndex
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: COMMENTS_TABLE,
        IndexName: "PostIndex",
        KeyConditionExpression: "postId = :postId",
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":postId": postId,
          ":status": status,
        },
        Limit: limit,
        ScanIndexForward: true, // Ordre chronologique
      })
    );

    console.log(`Retrieved ${result.Items.length} comments for post: ${postId}`);

    return response.ok({
      comments: result.Items,
      count: result.Items.length,
      postId: postId,
    });
  } catch (error) {
    console.error("Error in getComments:", error);
    return response.handleError(error);
  }
};

/**
 * UPDATE COMMENT - Modifier un commentaire
 * PUT /comments/{commentId}
 *
 * Nécessite authentification
 * Seul l'auteur peut modifier son commentaire
 *
 * Body:
 * {
 *   "content": "Updated comment"
 * }
 */
module.exports.updateComment = async (event) => {
  console.log("=== UPDATE COMMENT ===");

  try {
    const commentId = event.pathParameters?.commentId;
    const authUserId = event.requestContext?.authorizer?.userId;

    if (!commentId) {
      return response.badRequest("Comment ID is required");
    }

    // Vérifier que le commentaire existe
    const existingComment = await dynamodb.send(
      new GetCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
      })
    );

    if (!existingComment.Item) {
      return response.notFound("Comment not found");
    }

    // Vérification d'autorisation
    if (existingComment.Item.userId !== authUserId) {
      return response.forbidden("You can only edit your own comments");
    }

    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validateComment(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Mettre à jour le commentaire
    const updateResult = await dynamodb.send(
      new UpdateCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
        UpdateExpression: "SET #content = :content, updatedAt = :updatedAt, #status = :status",
        ExpressionAttributeNames: {
          "#content": "content",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":content": validation.sanitizeString(body.content),
          ":updatedAt": new Date().toISOString(),
          ":status": "pending", // Retour en modération après édition
        },
        ReturnValues: "ALL_NEW",
      })
    );

    console.log(`Comment updated: ${commentId}`);

    return response.ok({
      message: "Comment updated successfully",
      comment: updateResult.Attributes,
    });
  } catch (error) {
    console.error("Error in updateComment:", error);
    return response.handleError(error);
  }
};

/**
 * DELETE COMMENT - Supprimer un commentaire
 * DELETE /comments/{commentId}
 *
 * Nécessite authentification
 * L'auteur du commentaire ou un admin peut supprimer
 */
module.exports.deleteComment = async (event) => {
  console.log("=== DELETE COMMENT ===");

  try {
    const commentId = event.pathParameters?.commentId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!commentId) {
      return response.badRequest("Comment ID is required");
    }

    // Vérifier que le commentaire existe
    const existingComment = await dynamodb.send(
      new GetCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
      })
    );

    if (!existingComment.Item) {
      return response.notFound("Comment not found");
    }

    // Vérification d'autorisation
    if (existingComment.Item.userId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only delete your own comments");
    }

    // Supprimer le commentaire
    await dynamodb.send(
      new DeleteCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
      })
    );

    console.log(`Comment deleted: ${commentId}`);

    return response.ok({
      message: "Comment deleted successfully",
      commentId: commentId,
    });
  } catch (error) {
    console.error("Error in deleteComment:", error);
    return response.handleError(error);
  }
};

/**
 * MODERATE COMMENT - Approuver ou rejeter un commentaire
 * PATCH /comments/{commentId}/moderate
 *
 * Nécessite authentification admin
 *
 * Body:
 * {
 *   "status": "approved" | "rejected"
 * }
 */
module.exports.moderateComment = async (event) => {
  console.log("=== MODERATE COMMENT ===");

  try {
    const commentId = event.pathParameters?.commentId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!commentId) {
      return response.badRequest("Comment ID is required");
    }

    // Vérification admin uniquement
    if (authUserRole !== "admin") {
      return response.forbidden("Only admins can moderate comments");
    }

    // Vérifier que le commentaire existe
    const existingComment = await dynamodb.send(
      new GetCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
      })
    );

    if (!existingComment.Item) {
      return response.notFound("Comment not found");
    }

    // Parse du body
    const body = JSON.parse(event.body || "{}");

    const validStatuses = ["approved", "rejected", "pending"];
    if (!body.status || !validStatuses.includes(body.status)) {
      return response.badRequest(`Status must be one of: ${validStatuses.join(", ")}`);
    }

    // Mettre à jour le statut
    const updateResult = await dynamodb.send(
      new UpdateCommand({
        TableName: COMMENTS_TABLE,
        Key: { commentId: commentId },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": body.status,
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
    );

    console.log(`Comment moderated: ${commentId} -> ${body.status}`);

    return response.ok({
      message: `Comment ${body.status} successfully`,
      comment: updateResult.Attributes,
    });
  } catch (error) {
    console.error("Error in moderateComment:", error);
    return response.handleError(error);
  }
};
