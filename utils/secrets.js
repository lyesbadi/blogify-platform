"use strict";

const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

/**
 * SECRETS MANAGER UTILITY
 * ========================
 * Gestion centralisée des secrets AWS Secrets Manager
 * Implémente le caching pour optimiser les performances
 */

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-1" });

// Cache des secrets pour éviter les appels répétés
let secretCache = {};

/**
 * Récupère un secret depuis AWS Secrets Manager
 * Utilise un cache pour les appels répétés dans la même exécution Lambda
 * @param {string} secretName - Nom du secret
 * @returns {Promise<object>} Secret décodé
 */
async function getSecret(secretName) {
  // Vérifier le cache
  if (secretCache[secretName]) {
    console.log(`Secret '${secretName}' retrieved from cache`);
    return secretCache[secretName];
  }

  try {
    console.log(`Fetching secret '${secretName}' from AWS Secrets Manager`);

    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    if (!response.SecretString) {
      throw new Error(`Secret '${secretName}' has no SecretString value`);
    }

    const secret = JSON.parse(response.SecretString);

    // Mettre en cache
    secretCache[secretName] = secret;

    console.log(`Secret '${secretName}' successfully retrieved and cached`);
    return secret;
  } catch (error) {
    console.error(`Error fetching secret '${secretName}':`, error);
    throw new Error(`Failed to retrieve secret: ${error.message}`);
  }
}

/**
 * Récupère la clé JWT depuis Secrets Manager
 * @returns {Promise<string>} Clé JWT
 */
async function getJWTSecret() {
  const secretName = process.env.JWT_SECRET_NAME;

  if (!secretName) {
    throw new Error("JWT_SECRET_NAME environment variable is not set");
  }

  const secret = await getSecret(secretName);

  if (!secret.jwtSecret) {
    throw new Error("jwtSecret not found in secret");
  }

  return secret.jwtSecret;
}

/**
 * Efface le cache des secrets
 * Utile pour les tests ou pour forcer un rechargement
 */
function clearCache() {
  secretCache = {};
  console.log("Secret cache cleared");
}

/**
 * Vérifie si un secret est en cache
 * @param {string} secretName - Nom du secret
 * @returns {boolean} True si en cache
 */
function isInCache(secretName) {
  return secretName in secretCache;
}

module.exports = {
  getSecret,
  getJWTSecret,
  clearCache,
  isInCache,
};
