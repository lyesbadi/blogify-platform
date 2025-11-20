"use strict";

/**
 * RESPONSE UTILITY
 * ================
 * Gère les réponses HTTP standardisées pour toutes les Lambda functions
 * Assure la cohérence des réponses API
 */

/**
 * Crée une réponse HTTP formatée
 * @param {number} statusCode - Code de statut HTTP
 * @param {object} data - Données à renvoyer
 * @param {object} headers - Headers HTTP additionnels (optionnel)
 * @returns {object} Réponse formatée pour API Gateway
 */
function success(statusCode, data, headers = {}) {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Réponse de succès avec code 200
 * @param {object} data - Données à renvoyer
 * @returns {object} Réponse HTTP 200
 */
function ok(data) {
  return success(200, data);
}

/**
 * Réponse de création avec code 201
 * @param {object} data - Données créées
 * @returns {object} Réponse HTTP 201
 */
function created(data) {
  return success(201, data);
}

/**
 * Réponse d'erreur formatée
 * @param {number} statusCode - Code d'erreur HTTP
 * @param {string} message - Message d'erreur
 * @param {object} details - Détails additionnels (optionnel)
 * @returns {object} Réponse d'erreur formatée
 */
function error(statusCode, message, details = null) {
  const body = {
    error: true,
    message: message,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    body.details = details;
  }

  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Réponse 400 - Bad Request
 * @param {string} message - Message d'erreur
 * @param {object} details - Détails de validation
 * @returns {object} Réponse HTTP 400
 */
function badRequest(message = "Bad Request", details = null) {
  return error(400, message, details);
}

/**
 * Réponse 401 - Unauthorized
 * @param {string} message - Message d'erreur
 * @returns {object} Réponse HTTP 401
 */
function unauthorized(message = "Unauthorized") {
  return error(401, message);
}

/**
 * Réponse 403 - Forbidden
 * @param {string} message - Message d'erreur
 * @returns {object} Réponse HTTP 403
 */
function forbidden(message = "Forbidden") {
  return error(403, message);
}

/**
 * Réponse 404 - Not Found
 * @param {string} message - Message d'erreur
 * @returns {object} Réponse HTTP 404
 */
function notFound(message = "Resource not found") {
  return error(404, message);
}

/**
 * Réponse 409 - Conflict
 * @param {string} message - Message d'erreur
 * @returns {object} Réponse HTTP 409
 */
function conflict(message = "Resource already exists") {
  return error(409, message);
}

/**
 * Réponse 500 - Internal Server Error
 * @param {string} message - Message d'erreur
 * @param {Error} err - Objet Error (optionnel, pour le logging)
 * @returns {object} Réponse HTTP 500
 */
function internalError(message = "Internal Server Error", err = null) {
  if (err) {
    console.error("Internal Error:", err);
  }
  // Ne pas exposer les détails de l'erreur en production
  return error(500, message);
}

/**
 * Gestion centralisée des erreurs
 * @param {Error} err - Objet Error
 * @returns {object} Réponse HTTP appropriée
 */
function handleError(err) {
  console.error("Error occurred:", err);

  // Erreurs de validation
  if (err.name === "ValidationError") {
    return badRequest(err.message, err.details);
  }

  // Erreurs DynamoDB
  if (err.name === "ResourceNotFoundException") {
    return notFound("Resource not found in database");
  }

  if (err.name === "ConditionalCheckFailedException") {
    return conflict("Resource already exists or condition not met");
  }

  // Erreurs S3
  if (err.name === "NoSuchKey") {
    return notFound("File not found in storage");
  }

  // Erreur par défaut
  return internalError("An unexpected error occurred");
}

module.exports = {
  success,
  ok,
  created,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  handleError,
};
