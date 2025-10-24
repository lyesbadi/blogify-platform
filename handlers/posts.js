// handlers/posts.js
"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const response = require("../utils/response");
const validation = require("../utils/validation");

/**
 * POSTS HANDLER
 * =============
 * Gestion complète des articles de blog (CRUD)
 *
 * Fonctionnalités:
 * - Création d'articles
 * - Récupération d'un article
 * - Liste de tous les articles (avec pagination)
 * - Mise à jour d'articles
 * - Suppression d'articles
 * - Récupération des articles par auteur
 * - Recherche d'articles
 */

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const POSTS_TABLE = process.env.POSTS_TABLE;

/**
 * CREATE POST - Créer un nouvel article de blog
 * POST /posts
 *
 * Nécessite authentification
 *
 * Body:
 * {
 *   "title": "My Blog Post",
 *   "content": "Content here...",
 *   "excerpt": "Short description" (optionnel),
 *   "status": "draft" | "published" | "archived" (optionnel, défaut: draft),
 *   "tags": ["tag1", "tag2"] (optionnel),
 *   "coverImageUrl": "https://..." (optionnel)
 * }
 */
module.exports.createPost = async (event) => {
  console.log("=== CREATE POST ===");

  try {
    const authorId = event.requestContext?.authorizer?.userId;
    const authorName = event.requestContext?.authorizer?.name;
    const authorEmail = event.requestContext?.authorizer?.email;

    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    const validationResult = validation.validatePost(body);
    if (!validationResult.valid) {
      return response.badRequest("Validation failed", validationResult.errors);
    }

    // Création du post
    const postId = uuidv4();
    const now = new Date().toISOString();

    const post = {
      postId: postId,
      authorId: authorId,
      authorName: authorName,
      authorEmail: authorEmail,
      title: validation.sanitizeString(body.title),
      content: validation.sanitizeString(body.content),
      excerpt: body.excerpt ? validation.sanitizeString(body.excerpt) : "",
      status: body.status || "draft",
      tags: body.tags || [],
      coverImageUrl: body.coverImageUrl || "",
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: body.status === "published" ? now : null,
    };

    // Sauvegarder dans DynamoDB
    await dynamodb.send(
      new PutCommand({
        TableName: POSTS_TABLE,
        Item: post,
        ConditionExpression: "attribute_not_exists(postId)",
      })
    );

    console.log(`Post created successfully: ${postId}`);

    return response.created({
      message: "Post created successfully",
      post: post,
    });
  } catch (error) {
    console.error("Error in createPost:", error);
    return response.handleError(error);
  }
};

/**
 * GET POST - Récupérer un article spécifique
 * GET /posts/{postId}
 *
 * Public (pas d'authentification requise)
 * Incrémente le compteur de vues
 */
module.exports.getPost = async (event) => {
  console.log("=== GET POST ===");

  try {
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return response.badRequest("Post ID is required");
    }

    // Récupérer le post
    const result = await dynamodb.send(
      new GetCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
      })
    );

    if (!result.Item) {
      return response.notFound("Post not found");
    }

    const post = result.Item;

    // Incrémenter le compteur de vues (asynchrone, ne pas attendre)
    dynamodb
      .send(
        new UpdateCommand({
          TableName: POSTS_TABLE,
          Key: { postId: postId },
          UpdateExpression: "SET viewCount = if_not_exists(viewCount, :zero) + :inc",
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
          },
        })
      )
      .catch((err) => console.error("Error updating view count:", err));

    console.log(`Post retrieved: ${postId}`);

    return response.ok({
      post: post,
    });
  } catch (error) {
    console.error("Error in getPost:", error);
    return response.handleError(error);
  }
};

/**
 * GET ALL POSTS - Lister tous les articles
 * GET /posts?status=published&limit=10&lastKey=xxx
 *
 * Public
 * Supporte la pagination avec lastKey
 * Peut filtrer par status
 */
module.exports.getAllPosts = async (event) => {
  console.log("=== GET ALL POSTS ===");

  try {
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status || "published"; // Par défaut: articles publiés
    const limit = parseInt(queryParams.limit) || 20;
    const lastKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : null;

    // Query avec index StatusIndex pour filtrer par status et trier par date
    const params = {
      TableName: POSTS_TABLE,
      IndexName: "StatusIndex",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
      },
      Limit: limit,
      ScanIndexForward: false, // Tri DESC (plus récent en premier)
    };

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));

    console.log(`Retrieved ${result.Items.length} posts`);

    const responseData = {
      posts: result.Items,
      count: result.Items.length,
    };

    // Si il y a plus de résultats, inclure lastKey pour pagination
    if (result.LastEvaluatedKey) {
      responseData.lastKey = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
      responseData.hasMore = true;
    } else {
      responseData.hasMore = false;
    }

    return response.ok(responseData);
  } catch (error) {
    console.error("Error in getAllPosts:", error);
    return response.handleError(error);
  }
};

/**
 * UPDATE POST - Mettre à jour un article
 * PUT /posts/{postId}
 *
 * Nécessite authentification
 * Seul l'auteur ou un admin peut modifier
 *
 * Body: (tous les champs sont optionnels)
 * {
 *   "title": "Updated title",
 *   "content": "Updated content",
 *   "excerpt": "Updated excerpt",
 *   "status": "published",
 *   "tags": ["new", "tags"],
 *   "coverImageUrl": "https://..."
 * }
 */
module.exports.updatePost = async (event) => {
  console.log("=== UPDATE POST ===");

  try {
    const postId = event.pathParameters?.postId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!postId) {
      return response.badRequest("Post ID is required");
    }

    // Vérifier que le post existe
    const existingPost = await dynamodb.send(
      new GetCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
      })
    );

    if (!existingPost.Item) {
      return response.notFound("Post not found");
    }

    // Vérification d'autorisation
    if (existingPost.Item.authorId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only edit your own posts");
    }

    // Parse et validation du body
    const body = JSON.parse(event.body || "{}");

    // Construire l'expression de mise à jour dynamiquement
    const updates = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    if (body.title) {
      const validationResult = validation.validatePost({ title: body.title, content: "dummy" });
      if (!validationResult.valid) {
        return response.badRequest("Invalid title", validationResult.errors);
      }
      updates.push("#title = :title");
      expressionAttributeNames["#title"] = "title";
      expressionAttributeValues[":title"] = validation.sanitizeString(body.title);
    }

    if (body.content) {
      updates.push("#content = :content");
      expressionAttributeNames["#content"] = "content";
      expressionAttributeValues[":content"] = validation.sanitizeString(body.content);
    }

    if (body.excerpt !== undefined) {
      updates.push("excerpt = :excerpt");
      expressionAttributeValues[":excerpt"] = validation.sanitizeString(body.excerpt);
    }

    if (body.status) {
      const validStatuses = ["draft", "published", "archived"];
      if (!validStatuses.includes(body.status)) {
        return response.badRequest(`Status must be one of: ${validStatuses.join(", ")}`);
      }
      updates.push("#status = :status");
      expressionAttributeNames["#status"] = "status";
      expressionAttributeValues[":status"] = body.status;

      // Si on publie pour la première fois, définir publishedAt
      if (body.status === "published" && !existingPost.Item.publishedAt) {
        updates.push("publishedAt = :publishedAt");
        expressionAttributeValues[":publishedAt"] = new Date().toISOString();
      }
    }

    if (body.tags) {
      if (!Array.isArray(body.tags)) {
        return response.badRequest("Tags must be an array");
      }
      updates.push("tags = :tags");
      expressionAttributeValues[":tags"] = body.tags;
    }

    if (body.coverImageUrl !== undefined) {
      updates.push("coverImageUrl = :coverImageUrl");
      expressionAttributeValues[":coverImageUrl"] = body.coverImageUrl;
    }

    // Toujours mettre à jour updatedAt
    updates.push("updatedAt = :updatedAt");
    expressionAttributeValues[":updatedAt"] = new Date().toISOString();

    if (updates.length === 1) {
      return response.badRequest("No valid fields to update");
    }

    // Mettre à jour le post
    const updateResult = await dynamodb.send(
      new UpdateCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    console.log(`Post updated: ${postId}`);

    return response.ok({
      message: "Post updated successfully",
      post: updateResult.Attributes,
    });
  } catch (error) {
    console.error("Error in updatePost:", error);
    return response.handleError(error);
  }
};

/**
 * DELETE POST - Supprimer un article
 * DELETE /posts/{postId}
 *
 * Nécessite authentification
 * Seul l'auteur ou un admin peut supprimer
 */
module.exports.deletePost = async (event) => {
  console.log("=== DELETE POST ===");

  try {
    const postId = event.pathParameters?.postId;
    const authUserId = event.requestContext?.authorizer?.userId;
    const authUserRole = event.requestContext?.authorizer?.role;

    if (!postId) {
      return response.badRequest("Post ID is required");
    }

    // Vérifier que le post existe
    const existingPost = await dynamodb.send(
      new GetCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
      })
    );

    if (!existingPost.Item) {
      return response.notFound("Post not found");
    }

    // Vérification d'autorisation
    if (existingPost.Item.authorId !== authUserId && authUserRole !== "admin") {
      return response.forbidden("You can only delete your own posts");
    }

    // Supprimer le post
    await dynamodb.send(
      new DeleteCommand({
        TableName: POSTS_TABLE,
        Key: { postId: postId },
      })
    );

    console.log(`Post deleted: ${postId}`);

    return response.ok({
      message: "Post deleted successfully",
      postId: postId,
    });
  } catch (error) {
    console.error("Error in deletePost:", error);
    return response.handleError(error);
  }
};

/**
 * GET POSTS BY AUTHOR - Récupérer tous les posts d'un auteur
 * GET /posts/author/{userId}?limit=10&lastKey=xxx
 *
 * Public
 * Supporte la pagination
 */
module.exports.getPostsByAuthor = async (event) => {
  console.log("=== GET POSTS BY AUTHOR ===");

  try {
    const authorId = event.pathParameters?.userId;
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 20;
    const lastKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : null;

    if (!authorId) {
      return response.badRequest("Author ID is required");
    }

    // Query avec index AuthorIndex
    const params = {
      TableName: POSTS_TABLE,
      IndexName: "AuthorIndex",
      KeyConditionExpression: "authorId = :authorId",
      ExpressionAttributeValues: {
        ":authorId": authorId,
      },
      Limit: limit,
      ScanIndexForward: false, // Plus récent en premier
    };

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));

    console.log(`Retrieved ${result.Items.length} posts for author: ${authorId}`);

    const responseData = {
      posts: result.Items,
      count: result.Items.length,
      authorId: authorId,
    };

    if (result.LastEvaluatedKey) {
      responseData.lastKey = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
      responseData.hasMore = true;
    } else {
      responseData.hasMore = false;
    }

    return response.ok(responseData);
  } catch (error) {
    console.error("Error in getPostsByAuthor:", error);
    return response.handleError(error);
  }
};

/**
 * SEARCH POSTS - Rechercher des articles par titre ou contenu
 * GET /posts/search?q=keyword&limit=10
 *
 * Public
 * Note: Utilise un scan, pas optimal pour une grosse base de données
 * Pour production, considérer ElasticSearch ou DynamoDB + Lambda Stream
 */
module.exports.searchPosts = async (event) => {
  console.log("=== SEARCH POSTS ===");

  try {
    const queryParams = event.queryStringParameters || {};
    const searchQuery = queryParams.q;
    const limit = parseInt(queryParams.limit) || 20;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return response.badRequest("Search query must be at least 2 characters");
    }

    const searchTerm = searchQuery.toLowerCase().trim();

    // Scan avec filtre (pas optimal mais simple pour commencer)
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: POSTS_TABLE,
        FilterExpression:
          "#status = :published AND (contains(lower(#title), :search) OR contains(lower(#content), :search))",
        ExpressionAttributeNames: {
          "#status": "status",
          "#title": "title",
          "#content": "content",
        },
        ExpressionAttributeValues: {
          ":published": "published",
          ":search": searchTerm,
        },
        Limit: limit,
      })
    );

    console.log(`Search found ${result.Items.length} posts for query: ${searchQuery}`);

    return response.ok({
      posts: result.Items,
      count: result.Items.length,
      query: searchQuery,
    });
  } catch (error) {
    console.error("Error in searchPosts:", error);
    return response.handleError(error);
  }
};
