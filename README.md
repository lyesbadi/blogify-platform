# 📝 Blogify - Headless Blogging Platform

Une plateforme de blogging headless complète construite avec AWS Lambda, API Gateway, DynamoDB, et S3.

## 🎯 Objectif du Projet

Blogify est une solution backend scalable pour la gestion de contenu de blog, offrant une API REST complète pour créer, gérer et publier du contenu. La plateforme supporte l'authentification des utilisateurs, les rôles, la gestion des médias et les commentaires.

## 🏗️ Architecture

### Services AWS Utilisés

- **AWS Lambda**: Fonctions serverless pour la logique métier
- **API Gateway**: Endpoints REST pour l'API
- **DynamoDB**: Base de données NoSQL pour le stockage
- **S3**: Stockage des médias (images, vidéos)
- **Secrets Manager**: Gestion sécurisée des secrets JWT

### Tables DynamoDB

1. **Users**: Stockage des utilisateurs et authentification
2. **Posts**: Articles de blog avec métadonnées
3. **Comments**: Commentaires sur les articles
4. **Media**: Métadonnées des fichiers uploadés

### Structure du Projet

```
blogify/
├── serverless.yml          # Configuration Serverless Framework
├── package.json            # Dépendances Node.js
├── handlers/              # Lambda functions
│   ├── auth.js           # Authentification (register, login)
│   ├── authorizer.js     # JWT Authorizer
│   ├── users.js          # Gestion utilisateurs
│   ├── posts.js          # CRUD articles
│   ├── comments.js       # Gestion commentaires
│   └── media.js          # Upload/gestion médias
├── utils/                 # Utilities partagées
│   ├── response.js       # Helpers réponses HTTP
│   ├── jwt.js            # Gestion JWT
│   ├── validation.js     # Validation des données
│   └── secrets.js        # AWS Secrets Manager
└── README.md             # Documentation
```

## ⚙️ Installation

### Prérequis

- Node.js >= 20.0.0
- AWS CLI configuré
- Serverless Framework
- Compte AWS avec permissions appropriées

### Étapes d'Installation

1. **Cloner le projet**

```bash
cd blogify
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer AWS CLI**

```bash
aws configure
# Entrer vos credentials AWS
```

4. **Installer Serverless Framework (si pas déjà fait)**

```bash
npm install -g serverless
```

## 🚀 Déploiement

### Déploiement en développement

```bash
npm run deploy:dev
# ou
serverless deploy --stage dev
```

### Déploiement en production

```bash
npm run deploy:prod
# ou
serverless deploy --stage prod
```

### Récupérer l'URL de l'API

Après le déploiement, l'URL de l'API sera affichée dans les outputs:

```
API Gateway URL: https://xxxxxxxxxx.execute-api.eu-west-1.amazonaws.com/dev
```

Sauvegardez cette URL pour les tests Postman !

## 📚 Documentation API

### Base URL

```
https://xxxxxxxxxx.execute-api.eu-west-1.amazonaws.com/dev
```

---

## 🔐 Authentification

### 1. Register (Inscription)

**Endpoint**: `POST /auth/register`

**Body**:

```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "role": "author"
}
```

**Réponse** (201 Created):

```json
{
  "message": "User registered successfully",
  "user": {
    "userId": "uuid",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "author",
    "createdAt": "2025-01-15T10:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Rôles disponibles**:

- `author`: Peut créer et gérer ses propres articles
- `editor`: Peut éditer les articles des autres
- `admin`: Accès complet

---

### 2. Login (Connexion)

**Endpoint**: `POST /auth/login`

**Body**:

```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123"
}
```

**Réponse** (200 OK):

```json
{
  "message": "Login successful",
  "user": {
    "userId": "uuid",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "author"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 👤 Gestion des Utilisateurs

### 3. Get User Profile

**Endpoint**: `GET /users/{userId}`

**Headers**:

```
Authorization: Bearer <token>
```

**Réponse** (200 OK):

```json
{
  "user": {
    "userId": "uuid",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "author",
    "bio": "Passionate writer",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

---

### 4. Update User Profile

**Endpoint**: `PUT /users/{userId}`

**Headers**:

```
Authorization: Bearer <token>
```

**Body**:

```json
{
  "name": "John Updated",
  "bio": "Updated bio",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

---

## 📄 Gestion des Articles (Posts)

### 5. Create Post

**Endpoint**: `POST /posts`

**Headers**:

```
Authorization: Bearer <token>
```

**Body**:

```json
{
  "title": "My First Blog Post",
  "content": "This is the content of my blog post...",
  "excerpt": "Short description",
  "status": "published",
  "tags": ["tech", "aws", "serverless"],
  "coverImageUrl": "https://example.com/image.jpg"
}
```

**Statuts disponibles**:

- `draft`: Brouillon (non publié)
- `published`: Publié
- `archived`: Archivé

---

### 6. Get Single Post

**Endpoint**: `GET /posts/{postId}`

**Réponse** (200 OK):

```json
{
  "post": {
    "postId": "uuid",
    "authorId": "uuid",
    "authorName": "John Doe",
    "title": "My First Blog Post",
    "content": "...",
    "status": "published",
    "tags": ["tech", "aws"],
    "viewCount": 42,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "publishedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

---

### 7. List All Posts

**Endpoint**: `GET /posts?status=published&limit=20&lastKey=xxx`

**Query Parameters**:

- `status`: draft | published | archived (défaut: published)
- `limit`: Nombre de résultats (défaut: 20)
- `lastKey`: Pour la pagination

**Réponse** (200 OK):

```json
{
  "posts": [...],
  "count": 20,
  "hasMore": true,
  "lastKey": "encoded_key_for_pagination"
}
```

---

### 8. Update Post

**Endpoint**: `PUT /posts/{postId}`

**Headers**:

```
Authorization: Bearer <token>
```

**Body** (tous les champs optionnels):

```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "status": "published",
  "tags": ["updated", "tags"]
}
```

---

### 9. Delete Post

**Endpoint**: `DELETE /posts/{postId}`

**Headers**:

```
Authorization: Bearer <token>
```

---

### 10. Get Posts by Author

**Endpoint**: `GET /posts/author/{userId}?limit=20`

---

### 11. Search Posts

**Endpoint**: `GET /posts/search?q=keyword&limit=20`

**Query Parameters**:

- `q`: Terme de recherche (minimum 2 caractères)
- `limit`: Nombre de résultats

---

## 🖼️ Gestion des Médias

### 12. Upload Media

**Endpoint**: `POST /media/upload`

**Headers**:

```
Authorization: Bearer <token>
```

**Body**:

```json
{
  "filename": "my-image.jpg",
  "contentType": "image/jpeg",
  "data": "base64_encoded_file_data"
}
```

**Types de fichiers supportés**:

- Images: jpeg, png, gif, webp
- Vidéos: mp4
- Taille max: 10 MB

**Réponse** (201 Created):

```json
{
  "message": "Media uploaded successfully",
  "media": {
    "mediaId": "uuid",
    "filename": "my-image.jpg",
    "contentType": "image/jpeg",
    "size": 245678,
    "url": "https://s3-presigned-url...",
    "uploadedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

---

### 13. Get Media

**Endpoint**: `GET /media/{mediaId}`

**Réponse**: Retourne une URL signée valide 1h

---

### 14. List User Media

**Endpoint**: `GET /media/user/{userId}?limit=20`

**Headers**:

```
Authorization: Bearer <token>
```

---

### 15. Delete Media

**Endpoint**: `DELETE /media/{mediaId}`

**Headers**:

```
Authorization: Bearer <token>
```

---

## 💬 Gestion des Commentaires (Optionnel)

### 16. Create Comment

**Endpoint**: `POST /posts/{postId}/comments`

**Headers**:

```
Authorization: Bearer <token>
```

**Body**:

```json
{
  "content": "Great article!"
}
```

---

### 17. Get Comments

**Endpoint**: `GET /posts/{postId}/comments?status=approved&limit=50`

**Statuts**:

- `pending`: En attente de modération
- `approved`: Approuvé
- `rejected`: Rejeté

---

### 18. Update Comment

**Endpoint**: `PUT /comments/{commentId}`

**Headers**:

```
Authorization: Bearer <token>
```

---

### 19. Delete Comment

**Endpoint**: `DELETE /comments/{commentId}`

**Headers**:

```
Authorization: Bearer <token>
```

---

### 20. Moderate Comment (Admin only)

**Endpoint**: `PATCH /comments/{commentId}/moderate`

**Headers**:

```
Authorization: Bearer <token>
```

**Body**:

```json
{
  "status": "approved"
}
```

---

## 🧪 Tests avec Postman

### 1. Importer la Collection

Créez une collection Postman avec l'URL de base de votre API.

### 2. Configuration des Variables

Dans Postman, définissez les variables suivantes :

- `baseUrl`: Votre API Gateway URL
- `token`: Le JWT reçu après login (sera automatisé)

### 3. Scénario de Test Complet

#### Étape 1: Register

```
POST {{baseUrl}}/auth/register
```

Sauvegarder le `token` de la réponse.

#### Étape 2: Login

```
POST {{baseUrl}}/auth/login
```

#### Étape 3: Créer un Article

```
POST {{baseUrl}}/posts
Header: Authorization: Bearer {{token}}
```

#### Étape 4: Lister les Articles

```
GET {{baseUrl}}/posts
```

#### Étape 5: Upload d'Image

```
POST {{baseUrl}}/media/upload
Header: Authorization: Bearer {{token}}
```

#### Étape 6: Ajouter un Commentaire

```
POST {{baseUrl}}/posts/{postId}/comments
Header: Authorization: Bearer {{token}}
```

---

## 🔒 Sécurité

### Authentification JWT

- Les tokens JWT sont signés avec un secret stocké dans AWS Secrets Manager
- Durée de validité: 7 jours
- Refresh automatique non implémenté (à ajouter en production)

### Autorisations

- Utilisateur: Peut modifier ses propres ressources
- Admin: Accès complet à toutes les ressources

### Best Practices

- Passwords hashés avec PBKDF2 (10000 iterations)
- Validation stricte des entrées
- Sanitization du contenu HTML
- Rate limiting recommandé (à configurer dans API Gateway)

---

## 📊 Monitoring et Logs

### Voir les Logs

```bash
# Logs d'une fonction spécifique
serverless logs -f createPost --tail

# Logs avec filtre
serverless logs -f createPost --filter "ERROR"
```

### CloudWatch

Tous les logs sont automatiquement envoyés vers CloudWatch Logs.

---

## 🚧 Améliorations Futures

### Fonctionnalités à Ajouter

1. **Pagination améliorée**: Cursor-based pagination
2. **Cache**: ElastiCache Redis pour les posts populaires
3. **Recherche**: Integration avec OpenSearch/ElasticSearch
4. **Notifications**: SNS/SES pour notifier les auteurs
5. **Analytics**: Tracking des vues et engagement
6. **Rate Limiting**: Throttling au niveau API Gateway
7. **CDN**: CloudFront pour les médias
8. **Backup**: Automated DynamoDB backups

### Optimisations Performance

1. **Connection Pooling**: Déjà activé (`AWS_NODEJS_CONNECTION_REUSE_ENABLED`)
2. **Parallel Queries**: Utiliser `Promise.all()` pour requêtes multiples
3. **Lambda Layers**: Externaliser les dépendances communes
4. **Provisioned Concurrency**: Pour réduire les cold starts

---

## 💰 Estimation des Coûts

### Free Tier AWS (12 premiers mois)

- Lambda: 1M requêtes/mois GRATUIT
- DynamoDB: 25GB + 25 RCU/WCU GRATUIT
- S3: 5GB storage GRATUIT
- API Gateway: 1M requêtes/mois GRATUIT

### Au-delà du Free Tier (estimation pour 100K requêtes/mois)

- Lambda: ~$0.20
- DynamoDB: ~$1.25
- S3: ~$0.50
- API Gateway: ~$0.35
- **Total: ~$2.30/mois**

---

## 🛠️ Dépannage

### Erreur: "User: ... is not authorized to perform: ..."

Vérifiez les permissions IAM de votre utilisateur AWS.

### Erreur: "Cannot find module ..."

Exécutez `npm install` dans le répertoire du projet.

### Token Expired

Le token JWT expire après 7 jours. Reconnectez-vous.

### CORS Errors

CORS est activé par défaut. Vérifiez que le header `Authorization` est correctement envoyé.

---

## 🤝 Support

Pour questions ou problèmes, consultez :

- Documentation AWS Lambda: https://docs.aws.amazon.com/lambda/
- Serverless Framework: https://www.serverless.com/framework/docs/
- AWS SDK JavaScript: https://docs.aws.amazon.com/sdk-for-javascript/

---

## 📄 Licence

MIT

---

**Développé avec ❤️ pour le cours Serverless Computing**
