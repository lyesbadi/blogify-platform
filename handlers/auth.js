// handlers/auth.js
"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const response = require("../utils/response");
const validation = require("../utils/validation");
const jwt = require("../utils/jwt");
const secrets = require("../utils/secrets");

/**
 * AUTHENTICATION HANDLER
 * ======================
 * Responsable de l'enregistrement et de la connexion des utilisateurs
 *
 * Fonctionnalités:
 * - Enregistrement de nouveaux utilisateurs
 * - Authentification (login) avec génération de JWT
 * - Hashage sécurisé des mots de passe (bcrypt-style avec salt)
 */

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Hash un mot de passe avec un salt aléatoire
 * @param {string} password - Mot de passe en clair
 * @returns {object} {hash, salt}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return { hash, salt };
}

/**
 * Vérifie un mot de passe contre un hash
 * @param {string} password - Mot de passe à vérifier
 * @param {string} hash - Hash stocké
 * @param {string} salt - Salt utilisé
 * @returns {boolean} True si le mot de passe correspond
 */
function verifyPassword(password, hash, salt) {
  const hashToVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return hash === hashToVerify;
}

/**
 * REGISTER - Enregistrer un nouvel utilisateur
 * POST /auth/register
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePass123",
 *   "name": "John Doe",
 *   "role": "author" (optionnel: admin, editor, author)
 * }
 */
module.exports.register = async (event) => {
  console.log("=== REGISTER USER ===");

  try {
    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validateRegistration(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Vérifier si l'email existe déjà
    const existingUser = await dynamodb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: "EmailIndex",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": body.email.toLowerCase().trim(),
        },
      })
    );

    if (existingUser.Items && existingUser.Items.length > 0) {
      return response.conflict("An account with this email already exists");
    }

    // Hash du mot de passe
    const { hash, salt } = hashPassword(body.password);

    // Création de l'utilisateur
    const userId = uuidv4();
    const now = new Date().toISOString();

    const user = {
      userId: userId,
      email: body.email.toLowerCase().trim(),
      name: validation.sanitizeString(body.name),
      role: body.role || "author", // Par défaut: author
      passwordHash: hash,
      passwordSalt: salt,
      bio: body.bio || "",
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // Sauvegarder dans DynamoDB
    await dynamodb.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: user,
        ConditionExpression: "attribute_not_exists(userId)",
      })
    );

    console.log(`User registered successfully: ${userId}`);

    // Générer un token JWT
    const jwtSecret = await secrets.getJWTSecret();
    const tokenPayload = jwt.createUserPayload(user);
    const token = jwt.generateToken(tokenPayload, jwtSecret, "7d");

    // Retourner l'utilisateur (sans les données sensibles)
    const { passwordHash, passwordSalt, ...userResponse } = user;

    return response.created({
      message: "User registered successfully",
      user: userResponse,
      token: token,
    });
  } catch (error) {
    console.error("Error in register:", error);
    return response.handleError(error);
  }
};

/**
 * LOGIN - Authentifier un utilisateur
 * POST /auth/login
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePass123"
 * }
 */
module.exports.login = async (event) => {
  console.log("=== LOGIN USER ===");

  try {
    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validateLogin(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Rechercher l'utilisateur par email
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: "EmailIndex",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": body.email.toLowerCase().trim(),
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return response.unauthorized("Invalid email or password");
    }

    const user = result.Items[0];

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return response.forbidden("Account is deactivated");
    }

    // Vérifier le mot de passe
    const isPasswordValid = verifyPassword(body.password, user.passwordHash, user.passwordSalt);

    if (!isPasswordValid) {
      return response.unauthorized("Invalid email or password");
    }

    console.log(`User logged in successfully: ${user.userId}`);

    // Générer un token JWT
    const jwtSecret = await secrets.getJWTSecret();
    const tokenPayload = jwt.createUserPayload(user);
    const token = jwt.generateToken(tokenPayload, jwtSecret, "7d");

    // Retourner l'utilisateur (sans les données sensibles)
    const { passwordHash, passwordSalt, ...userResponse } = user;

    return response.ok({
      message: "Login successful",
      user: userResponse,
      token: token,
    });
  } catch (error) {
    console.error("Error in login:", error);
    return response.handleError(error);
  }
};
