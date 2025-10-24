// utils/jwt.js
"use strict";

const crypto = require("crypto");

/**
 * JWT UTILITY
 * ===========
 * Gestion des tokens JWT pour l'authentification
 * Implémentation légère sans dépendances externes
 */

/**
 * Encode en Base64 URL-safe
 * @param {string} str - Chaîne à encoder
 * @returns {string} Chaîne encodée
 */
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode depuis Base64 URL-safe
 * @param {string} str - Chaîne à décoder
 * @returns {string} Chaîne décodée
 */
function base64UrlDecode(str) {
  // Ajouter le padding manquant
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString();
}

/**
 * Crée une signature HMAC SHA256
 * @param {string} data - Données à signer
 * @param {string} secret - Clé secrète
 * @returns {string} Signature encodée
 */
function createSignature(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * Génère un token JWT
 * @param {object} payload - Données à inclure dans le token
 * @param {string} secret - Clé secrète pour signer
 * @param {string} expiresIn - Durée de validité (ex: '24h', '7d')
 * @returns {string} Token JWT
 */
function generateToken(payload, secret, expiresIn = "24h") {
  // Header du JWT
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  // Calcul de l'expiration
  const now = Math.floor(Date.now() / 1000);
  const expiration = calculateExpiration(now, expiresIn);

  // Payload avec claims standards
  const claims = {
    ...payload,
    iat: now, // Issued at
    exp: expiration, // Expiration
  };

  // Encodage header et payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));

  // Création de la signature
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  // Token final
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Vérifie et décode un token JWT
 * @param {string} token - Token à vérifier
 * @param {string} secret - Clé secrète
 * @returns {object} Payload décodé ou null si invalide
 */
function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== "string") {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Vérification de la signature
    const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

    if (signature !== expectedSignature) {
      console.error("Invalid JWT signature");
      return null;
    }

    // Décodage du payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    // Vérification de l'expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error("JWT token expired");
      return null;
    }

    return payload;
  } catch (error) {
    console.error("Error verifying JWT:", error);
    return null;
  }
}

/**
 * Extrait le token du header Authorization
 * @param {string} authHeader - Header Authorization
 * @returns {string|null} Token extrait ou null
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  // Format attendu: "Bearer <token>"
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }

  return null;
}

/**
 * Calcule le timestamp d'expiration
 * @param {number} now - Timestamp actuel
 * @param {string} duration - Durée (ex: '24h', '7d', '30m')
 * @returns {number} Timestamp d'expiration
 */
function calculateExpiration(now, duration) {
  const regex = /^(\d+)([smhd])$/;
  const match = duration.match(regex);

  if (!match) {
    // Par défaut 24h
    return now + 24 * 60 * 60;
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1, // secondes
    m: 60, // minutes
    h: 60 * 60, // heures
    d: 24 * 60 * 60, // jours
  };

  return now + value * multipliers[unit];
}

/**
 * Crée un payload utilisateur standard
 * @param {object} user - Objet utilisateur
 * @returns {object} Payload JWT
 */
function createUserPayload(user) {
  return {
    userId: user.userId,
    email: user.email,
    role: user.role || "author",
    name: user.name,
  };
}

/**
 * Génère un token de réinitialisation de mot de passe
 * @param {string} userId - ID de l'utilisateur
 * @param {string} secret - Clé secrète
 * @returns {string} Token de reset
 */
function generateResetToken(userId, secret) {
  const payload = {
    userId: userId,
    type: "password_reset",
  };
  return generateToken(payload, secret, "1h"); // Expire en 1h
}

module.exports = {
  generateToken,
  verifyToken,
  extractTokenFromHeader,
  createUserPayload,
  generateResetToken,
};
