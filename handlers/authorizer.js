"use strict";

const jwt = require("../utils/jwt");
const secrets = require("../utils/secrets");

/**
 * LAMBDA AUTHORIZER
 * =================
 * Valide les tokens JWT pour les routes protégées
 * Retourne une IAM policy permettant ou refusant l'accès
 *
 * Cette fonction est appelée automatiquement par API Gateway
 * avant chaque requête sur une route protégée
 */

/**
 * Génère une IAM policy pour autoriser ou refuser l'accès
 * @param {string} principalId - ID de l'utilisateur
 * @param {string} effect - Allow ou Deny
 * @param {string} resource - ARN de la ressource API Gateway
 * @param {object} context - Données contextuelles à passer aux Lambda suivantes
 * @returns {object} IAM Policy
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId: principalId,
  };

  if (effect && resource) {
    authResponse.policyDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    };
  }

  // Context peut être utilisé dans les Lambda suivantes via event.requestContext.authorizer
  if (Object.keys(context).length > 0) {
    authResponse.context = context;
  }

  return authResponse;
}

/**
 * AUTHORIZE - Fonction d'autorisation Lambda
 *
 * Vérifie le token JWT dans le header Authorization
 * Si valide: autorise l'accès et passe les infos utilisateur au contexte
 * Si invalide: refuse l'accès
 */
module.exports.authorize = async (event) => {
  console.log("=== AUTHORIZER INVOKED ===");
  console.log("Method ARN:", event.methodArn);

  try {
    // Extraire le token du header Authorization
    const authHeader = event.authorizationToken;
    const token = jwt.extractTokenFromHeader(authHeader);

    if (!token) {
      console.error("No token provided");
      throw new Error("Unauthorized");
    }

    // Récupérer la clé JWT
    const jwtSecret = await secrets.getJWTSecret();

    // Vérifier le token
    const payload = jwt.verifyToken(token, jwtSecret);

    if (!payload) {
      console.error("Invalid token");
      throw new Error("Unauthorized");
    }

    console.log("Token validated for user:", payload.userId);

    // Créer le contexte à passer aux Lambda suivantes
    const context = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };

    // Autoriser l'accès
    // Note: "*" permet l'accès à toutes les routes de l'API
    // Pour plus de sécurité, vous pouvez spécifier des routes spécifiques
    return generatePolicy(payload.userId, "Allow", "*", context);
  } catch (error) {
    console.error("Authorization failed:", error.message);

    // En cas d'erreur, refuser l'accès
    // Note: L'authorizer doit throw "Unauthorized" pour un 401
    throw new Error("Unauthorized");
  }
};

/**
 * NOTES D'IMPLÉMENTATION:
 *
 * 1. Le contexte retourné est disponible dans les Lambda suivantes via:
 *    event.requestContext.authorizer.userId
 *    event.requestContext.authorizer.role
 *    etc.
 *
 * 2. Pour tester localement, vous pouvez simuler l'event avec:
 *    {
 *      "authorizationToken": "Bearer <your-token>",
 *      "methodArn": "arn:aws:execute-api:..."
 *    }
 *
 * 3. La policy générée est cachée par API Gateway (resultTtlInSeconds)
 *    Dans notre config, nous avons mis 0 pour désactiver le cache
 *    et toujours valider le token
 */
