/* eslint-disable */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("../models/User");
const Vlog = require("../models/Vlog");

dotenv.config();

// Sample data
const users = [
  {
    username: "techguru2024",
    email: "techguru@example.com",
    password: "TechPass123!",
    bio: "Tech enthusiast sharing the latest in AI, gadgets, and software development.",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
  },
  {
    username: "wanderlust_sarah",
    email: "sarah@example.com",
    password: "TravelPass123!",
    bio: "Digital nomad exploring the world one country at a time. Sharing travel tips and adventures.",
    avatar:
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
  },
  {
    username: "foodie_mike",
    email: "mike@example.com",
    password: "FoodPass123!",
    bio: "Chef turned food blogger. Cooking up delicious recipes and restaurant reviews.",
    avatar:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
  },
  {
    username: "fitlife_anna",
    email: "anna@example.com",
    password: "FitPass123!",
    bio: "Certified personal trainer helping you achieve your fitness goals with workout routines and nutrition tips.",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
  },
  {
    username: "creative_alex",
    email: "alex@example.com",
    password: "ArtPass123!",
    bio: "Digital artist and designer sharing creative process and tutorials.",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
  },
];

const vlogs = [
  {
    title: "Building an AI-Powered Web Application in 2024",
    description:
      "In this comprehensive tutorial, I walk through the process of building a modern web application powered by artificial intelligence. We cover everything from setting up the development environment to implementing machine learning models. This project demonstrates the latest best practices in full-stack development, including React frontend, Node.js backend, and integration with popular AI services. Perfect for developers looking to add AI capabilities to their applications.",
    content:
      "Full tutorial content with code examples and step-by-step instructions...",
    category: "technology",
    tags: [
      "AI",
      "web development",
      "tutorial",
      "machine learning",
      "React",
      "Node.js",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=600&fit=crop",
        publicId: "ai-web-dev-1",
        caption: "AI application architecture",
      },
      {
        url: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&h=600&fit=crop",
        publicId: "ai-web-dev-2",
        caption: "Modern development workspace",
      },
    ],
    views: 15420,
    likes: [],
    comments: [],
  },
  {
    title: "Hidden Gems: 7 Days in Kyoto Japan",
    description:
      "Join me on an incredible journey through the ancient capital of Japan. In this vlog, I explore hidden temples, traditional markets, and experience the authentic culture that most tourists miss. From sunrise at Fushimi Inari Shrine to the bamboo forests of Arashiyama, this comprehensive guide covers everything you need to know for your own Kyoto adventure. Includes transportation tips, budget recommendations, and cultural etiquette.",
    content: "Detailed travel itinerary with day-by-day breakdown...",
    category: "travel",
    tags: ["Japan", "Kyoto", "travel guide", "culture", "temples", "food"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop",
        publicId: "kyoto-travel-1",
        caption: "Fushimi Inari Shrine",
      },
      {
        url: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=800&h=600&fit=crop",
        publicId: "kyoto-travel-2",
        caption: "Bamboo forest pathway",
      },
    ],
    views: 23150,
    likes: [],
    comments: [],
  },
  {
    title: "Mastering Sourdough: From Starter to Perfect Loaf",
    description:
      "Everything you need to know about creating and maintaining a sourdough starter, plus my foolproof method for baking the perfect artisan loaf at home. This comprehensive guide covers the science behind sourdough, troubleshooting common problems, and advanced techniques for creating different types of bread. Includes timing schedules, equipment recommendations, and tips for achieving that perfect crust and crumb.",
    content: "Complete sourdough guide with recipes and techniques...",
    category: "food",
    tags: ["sourdough", "baking", "bread", "cooking", "recipe", "artisan"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&h=600&fit=crop",
        publicId: "sourdough-1",
        caption: "Perfect sourdough loaf",
      },
      {
        url: "https://images.unsplash.com/photo-1585478259715-4d3f6a44f7d8?w=800&h=600&fit=crop",
        publicId: "sourdough-2",
        caption: "Sourdough starter process",
      },
    ],
    views: 18930,
    likes: [],
    comments: [],
  },
  {
    title: "30-Minute HIIT Workout for Beginners",
    description:
      "Get fit with this beginner-friendly HIIT workout that requires no equipment. Perfect for those just starting their fitness journey or anyone looking for an effective home workout. I break down each exercise with proper form cues, modifications for different fitness levels, and tips for maximizing results. Includes warm-up, main workout, and cool-down routines designed to build strength and endurance safely.",
    content: "Complete workout routine with exercise descriptions...",
    category: "fitness",
    tags: [
      "HIIT",
      "workout",
      "fitness",
      "beginner",
      "home workout",
      "exercise",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop",
        publicId: "hiit-workout-1",
        caption: "HIIT exercise demonstration",
      },
      {
        url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&h=600&fit=crop",
        publicId: "hiit-workout-2",
        caption: "Home workout setup",
      },
    ],
    views: 31200,
    likes: [],
    comments: [],
  },
  {
    title: "Digital Art Tutorial: Creating Stunning Character Illustrations",
    description:
      "Learn my complete process for creating professional character illustrations using digital tools. This in-depth tutorial covers everything from initial concept sketches to final rendering techniques. I share my favorite brushes, color theory approaches, and composition strategies that will help you create compelling characters. Includes time-lapse recordings, layer organization tips, and advice for developing your unique artistic style.",
    content: "Step-by-step digital art tutorial with techniques and tips...",
    category: "art",
    tags: [
      "digital art",
      "character design",
      "illustration",
      "tutorial",
      "drawing",
      "creative",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1608889476561-6242cfdbf622?w=800&h=600&fit=crop",
        publicId: "digital-art-1",
        caption: "Character illustration process",
      },
      {
        url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&h=600&fit=crop",
        publicId: "digital-art-2",
        caption: "Digital painting workspace",
      },
    ],
    views: 12800,
    likes: [],
    comments: [],
  },
];

const seedDatabase = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/capsule",
    );
    console.log("Connected to MongoDB");

    // Clear existing data
    console.log("Clearing existing data...");
    await User.deleteMany({});
    await Vlog.deleteMany({});
    console.log("Existing data cleared");

    // Create users
    console.log("Creating users...");
    const createdUsers = [];
    for (const userData of users) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const user = await User.create({
        ...userData,
        password: hashedPassword,
        isVerified: true,
      });
      createdUsers.push(user);
      console.log(`Created user: ${user.username}`);
    }

    // Create vlogs
    console.log("Creating vlogs...");
    for (let i = 0; i < vlogs.length; i++) {
      const userIndex = i % createdUsers.length;
      const vlogData = {
        ...vlogs[i],
        author: createdUsers[userIndex]._id,
      };

      // Add some random likes from other users
      const otherUsers = createdUsers.filter(
        (user) =>
          user._id.toString() !== createdUsers[userIndex]._id.toString(),
      );
      const randomLikes = otherUsers
        .slice(0, Math.floor(Math.random() * 3) + 1)
        .map((user) => user._id);
      vlogData.likes = randomLikes;

      // Add some random comments
      const comments = [];
      const numComments = Math.floor(Math.random() * 5) + 1;
      for (let j = 0; j < numComments; j++) {
        const commentUser =
          otherUsers[Math.floor(Math.random() * otherUsers.length)];
        const commentTexts = [
          "Great content! Really enjoyed this.",
          "Thanks for sharing this detailed guide.",
          "This is exactly what I was looking for!",
          "Amazing work, keep it up!",
          "Very informative and well presented.",
        ];
        comments.push({
          user: commentUser._id,
          text: commentTexts[Math.floor(Math.random() * commentTexts.length)],
          createdAt: new Date(
            Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
          ), // Random within last 7 days
        });
      }
      vlogData.comments = comments;

      const vlog = await Vlog.create(vlogData);
      console.log(`Created vlog: ${vlog.title}`);
    }

    console.log("Database seeded successfully!");
    console.log(
      `Created ${createdUsers.length} users and ${vlogs.length} vlogs`,
    );

    // Create follower relationships
    console.log("Creating follower relationships...");
    for (let i = 0; i < createdUsers.length; i++) {
      const user = createdUsers[i];
      const otherUsers = createdUsers.filter(
        (u) => u._id.toString() !== user._id.toString(),
      );
      const followers = otherUsers.slice(0, Math.floor(Math.random() * 3) + 1);
      const following = otherUsers.slice(0, Math.floor(Math.random() * 3) + 1);

      user.followers = followers.map((f) => f._id);
      user.following = following.map((f) => f._id);
      await user.save();
    }

    console.log("Follower relationships created successfully!");
    console.log("Database seeding completed!");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
};

// Run the seed function
seedDatabase();
