// handlers/media.js
"use strict";

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const response = require("../utils/response");
const validation = require("../utils/validation");

/**
 * MEDIA HANDLER
 * =============
 * Gestion des médias (images, vidéos)
 *
 * Fonctionnalités:
 * - Upload de fichiers vers S3
 * - Récupération d'URL signées
 * - Liste des médias d'un utilisateur
 * - Suppression de médias
 */

const s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const MEDIA_TABLE = process.env.MEDIA_TABLE;

/**
 * UPLOAD MEDIA - Upload un fichier média vers S3
 * POST /media/upload
 *
 * Nécessite authentification
 * Le fichier doit être envoyé en base64 dans le body
 *
 * Body:
 * {
 *   "filename": "image.jpg",
 *   "contentType": "image/jpeg",
 *   "data": "base64_encoded_data"
 * }
 */
module.exports.uploadMedia = async (event) => {
  console.log("=== UPLOAD MEDIA ===");

  try {
    const userId = event.requestContext?.authorizer?.userId;
    const userName = event.requestContext?.authorizer?.name;

    // Parse du body
    const body = JSON.parse(event.body || "{}");

    if (!body.filename || !body.contentType || !body.data) {
      return response.badRequest("filename, contentType, and data are required");
    }

    // Décoder le fichier base64
    const fileBuffer = Buffer.from(body.data, "base64");

    // Validation du fichier
    const validationResult = validation.validateMedia({
      filename: body.filename,
      contentType: body.contentType,
      size: fileBuffer.length,
    });

    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Générer un ID unique pour le média
    const mediaId = uuidv4();
    const fileExtension = body.filename.split(".").pop();
    const s3Key = `media/${userId}/${mediaId}.${fileExtension}`;

    // Upload vers S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: body.contentType,
        Metadata: {
          userId: userId,
          originalFilename: body.filename,
          uploadedBy: userName,
        },
      })
    );

    console.log(`Media uploaded to S3: ${s3Key}`);

    // Sauvegarder les métadonnées dans DynamoDB
    const now = new Date().toISOString();
    const mediaItem = {
      mediaId: mediaId,
      userId: userId,
      userName: userName,
      filename: body.filename,
      s3Key: s3Key,
      contentType: body.contentType,
      size: fileBuffer.length,
      uploadedAt: now,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: MEDIA_TABLE,
        Item: mediaItem,
      })
    );

    console.log(`Media metadata saved: ${mediaId}`);

    // Générer une URL signée pour accès temporaire
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
      }),
      { expiresIn: 3600 } // 1 heure
    );

    return response.created({
      message: "Media uploaded successfully",
      media: {
        ...mediaItem,
        url: signedUrl,
      },
    });
  } catch (error) {
    console.error("Error in uploadMedia:", error);
    return response.handleError(error);
  }
};

/**
 * GET MEDIA - Récupérer les informations d'un média
 * GET /media/{mediaId}
 *
 * Public
 * Retourne une URL signée pour télécharger le fichier
 */
module.exports.getMedia = async (event) => {
  console.log("=== GET MEDIA ===");

  try {
    const mediaId = event.pathParameters?.mediaId;

    if (!mediaId) {
      return response.badRequest("Media ID is required");
    }

    // Récupérer les métadonnées depuis DynamoDB
    const result = await dynamodb.send(
      new GetCommand({
        TableName: MEDIA_TABLE,
        Key: { mediaId: mediaId },
      })
    );

    if (!result.Item) {
      return response.notFound("Media not found");
    }

    const media = result.Item;

    // Générer une URL signée
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: media.s3Key,
      }),
      { expiresIn: 3600 } // 1 heure
    );

    console.log(`Media retrieved: ${mediaId}`);

    return response.ok({
      media: {
        ...media,
        url: signedUrl,
      },
    });
  } catch (error) {
    console.error("Error in getMedia:", error);
    return response.handleError(error);
  }
};

/**
 * LIST USER MEDIA - Liste tous les médias d'un utilisateur
 * GET /media/user/{userId}?limit=20&lastKey=xxx
 *
 * Nécessite authentification
 * Un utilisateur peut voir ses propres médias
 */
module.exports.listUserMedia = async (event) => {
  console.log("=== LIST USER MEDIA ===");

  try {
    const userId = event.pathParameters?.userId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!userId) {
      return response.badRequest("User ID is required");
    }

    // Vérification d'autorisation
    if (userId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only view your own media");
    }

    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 20;
    const lastKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : null;

    // Query avec index UserIndex
    const params = {
      TableName: MEDIA_TABLE,
      IndexName: "UserIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      Limit: limit,
      ScanIndexForward: false, // Plus récent en premier
    };

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));

    console.log(`Retrieved ${result.Items.length} media items for user: ${userId}`);

    // Générer des URLs signées pour chaque média
    const mediaWithUrls = await Promise.all(
      result.Items.map(async (item) => {
        const signedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: MEDIA_BUCKET,
            Key: item.s3Key,
          }),
          { expiresIn: 3600 }
        );

        return {
          ...item,
          url: signedUrl,
        };
      })
    );

    const responseData = {
      media: mediaWithUrls,
      count: mediaWithUrls.length,
    };

    if (result.LastEvaluatedKey) {
      responseData.lastKey = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
      responseData.hasMore = true;
    } else {
      responseData.hasMore = false;
    }

    return response.ok(responseData);
  } catch (error) {
    console.error("Error in listUserMedia:", error);
    return response.handleError(error);
  }
};

/**
 * DELETE MEDIA - Supprimer un média
 * DELETE /media/{mediaId}
 *
 * Nécessite authentification
 * Seul le propriétaire ou un admin peut supprimer
 */
module.exports.deleteMedia = async (event) => {
  console.log("=== DELETE MEDIA ===");

  try {
    const mediaId = event.pathParameters?.mediaId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!mediaId) {
      return response.badRequest("Media ID is required");
    }

    // Récupérer les métadonnées
    const result = await dynamodb.send(
      new GetCommand({
        TableName: MEDIA_TABLE,
        Key: { mediaId: mediaId },
      })
    );

    if (!result.Item) {
      return response.notFound("Media not found");
    }

    const media = result.Item;

    // Vérification d'autorisation
    if (media.userId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only delete your own media");
    }

    // Supprimer de S3
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: media.s3Key,
      })
    );

    console.log(`Media deleted from S3: ${media.s3Key}`);

    // Supprimer de DynamoDB
    await dynamodb.send(
      new DeleteCommand({
        TableName: MEDIA_TABLE,
        Key: { mediaId: mediaId },
      })
    );

    console.log(`Media metadata deleted: ${mediaId}`);

    return response.ok({
      message: "Media deleted successfully",
      mediaId: mediaId,
    });
  } catch (error) {
    console.error("Error in deleteMedia:", error);
    return response.handleError(error);
  }
};
