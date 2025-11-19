"use strict";

/**
 * VALIDATION UTILITY
 * ==================
 * Validation des données d'entrée pour assurer l'intégrité
 * Prévention des injections et données malformées
 */

/**
 * Valide une adresse email
 * @param {string} email - Email à valider
 * @returns {boolean} True si valide
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valide un mot de passe
 * Critères: min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
 * @param {string} password - Mot de passe à valider
 * @returns {object} {valid: boolean, message: string}
 */
function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, message: "Password is required" };
  }

  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }

  return { valid: true, message: "Password is valid" };
}

/**
 * Valide les données d'enregistrement
 * @param {object} data - Données utilisateur
 * @returns {object} {valid: boolean, errors: array}
 */
function validateRegistration(data) {
  const errors = [];

  if (!data.email || !isValidEmail(data.email)) {
    errors.push("Valid email is required");
  }

  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long");
  }

  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.valid) {
    errors.push(passwordValidation.message);
  }

  // Le rôle est toujours "author" par défaut
  // Si on détecte qu'un rôle a été envoyé, on l'ignore silencieusement
  // (on ne génère pas d'erreur pour ne pas révéler cette information à un attaquant)

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Valide les données de connexion
 * @param {object} data - Données de login
 * @returns {object} {valid: boolean, errors: array}
 */
function validateLogin(data) {
  const errors = [];

  if (!data.email || !isValidEmail(data.email)) {
    errors.push("Valid email is required");
  }

  if (!data.password || typeof data.password !== "string") {
    errors.push("Password is required");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Valide les données d'un article de blog
 * @param {object} data - Données du post
 * @returns {object} {valid: boolean, errors: array}
 */
function validatePost(data) {
  const errors = [];

  if (!data.title || typeof data.title !== "string" || data.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters long");
  }

  if (data.title && data.title.length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  if (!data.content || typeof data.content !== "string" || data.content.trim().length < 10) {
    errors.push("Content must be at least 10 characters long");
  }

  // Validation du statut
  const validStatuses = ["draft", "published", "archived"];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  // Validation des tags (optionnel)
  if (data.tags) {
    if (!Array.isArray(data.tags)) {
      errors.push("Tags must be an array");
    } else if (data.tags.length > 10) {
      errors.push("Maximum 10 tags allowed");
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Valide les données d'un commentaire
 * @param {object} data - Données du commentaire
 * @returns {object} {valid: boolean, errors: array}
 */
function validateComment(data) {
  const errors = [];

  if (!data.content || typeof data.content !== "string" || data.content.trim().length < 1) {
    errors.push("Comment content is required");
  }

  if (data.content && data.content.length > 1000) {
    errors.push("Comment must not exceed 1000 characters");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Valide une mise à jour de profil utilisateur
 * @param {object} data - Données à mettre à jour
 * @returns {object} {valid: boolean, errors: array}
 */
function validateProfileUpdate(data) {
  const errors = [];

  if (data.name !== undefined) {
    if (typeof data.name !== "string" || data.name.trim().length < 2) {
      errors.push("Name must be at least 2 characters long");
    }
  }

  if (data.bio !== undefined) {
    if (typeof data.bio !== "string") {
      errors.push("Bio must be a string");
    } else if (data.bio.length > 500) {
      errors.push("Bio must not exceed 500 characters");
    }
  }

  if (data.email !== undefined && !isValidEmail(data.email)) {
    errors.push("Valid email is required");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Valide un fichier média
 * @param {object} file - Informations du fichier
 * @returns {object} {valid: boolean, errors: array}
 */
function validateMedia(file) {
  const errors = [];
  const maxSize = 10 * 1024 * 1024; // 10 MB
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"];

  if (!file.contentType) {
    errors.push("Content type is required");
  } else if (!allowedTypes.includes(file.contentType)) {
    errors.push(`Invalid file type. Allowed: ${allowedTypes.join(", ")}`);
  }

  if (!file.size || file.size <= 0) {
    errors.push("File size is required");
  } else if (file.size > maxSize) {
    errors.push(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
  }

  if (!file.filename || typeof file.filename !== "string") {
    errors.push("Filename is required");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Sanitize une chaîne de caractères
 * Enlève les caractères dangereux pour prévenir les injections
 * @param {string} str - Chaîne à nettoyer
 * @returns {string} Chaîne nettoyée
 */
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Enlève les scripts
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Enlève les iframes
    .substring(0, 10000); // Limite la longueur
}

/**
 * Crée une erreur de validation personnalisée
 * @param {array} errors - Liste des erreurs
 * @returns {Error} Erreur de validation
 */
function createValidationError(errors) {
  const error = new Error("Validation failed");
  error.name = "ValidationError";
  error.details = errors;
  return error;
}

module.exports = {
  isValidEmail,
  validatePassword,
  validateRegistration,
  validateLogin,
  validatePost,
  validateComment,
  validateProfileUpdate,
  validateMedia,
  sanitizeString,
  createValidationError,
};
