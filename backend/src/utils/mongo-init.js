/* eslint-disable */
// MongoDB initialization script for Docker
// This script runs when the MongoDB container is first created

print("Starting MongoDB initialization...");

// Create database and user

db = db.getSiblingDB("capsule");

// Create application user
db.createUser({
  user: "vlogsphere_user",
  pwd: "vlogsphere_password123",
  roles: [
    {
      role: "readWrite",
      db: "capsule",
    },
  ],
});

// Create collections with validation
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["username", "email", "password"],
      properties: {
        username: {
          bsonType: "string",
          description: "Username must be a string",
        },
        email: {
          bsonType: "string",
          pattern: "^[^\s@]+@[^\s@]+\.[^\s@]+$",
          description: "Email must be valid",
        },
        password: {
          bsonType: "string",
          description: "Password must be a string",
        },
      },
    },
  },
});

db.createCollection("vlogs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["title", "description", "category", "author"],
      properties: {
        title: {
          bsonType: "string",
          description: "Title must be a string",
        },
        description: {
          bsonType: "string",
          description: "Description must be a string",
        },
        category: {
          bsonType: "string",
          enum: [
            "technology",
            "travel",
            "lifestyle",
            "food",
            "fashion",
            "fitness",
            "music",
            "art",
            "business",
            "education",
            "entertainment",
            "gaming",
            "sports",
            "health",
            "science",
            "photography",
            "diy",
            "other",
          ],
          description: "Category must be valid",
        },
        author: {
          bsonType: "objectId",
          description: "Author must be an ObjectId",
        },
      },
    },
  },
});

// Create indexes
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.vlogs.createIndex({ author: 1 });
db.vlogs.createIndex({ category: 1 });
db.vlogs.createIndex({ createdAt: -1 });
db.vlogs.createIndex({ title: "text", description: "text", tags: "text" });

print("MongoDB initialization completed successfully!");
