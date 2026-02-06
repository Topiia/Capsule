import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";

import { vlogAPI, uploadAPI } from "../services/api";
import Button from "../components/UI/Button";
import toast from "react-hot-toast";
import {
  PhotoIcon,
  TagIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

import { useParams } from "react-router-dom";

const CreateCapsule = ({ editMode = false }) => {
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);

  const categories = [
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
  ];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: "",
      description: "",
      content: "",
      category: "",
      tags: "",
      isPublic: true,
    },
  });

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    try {
      const response = await uploadAPI.uploadMultiple(Array.from(files));
      const newImages = response.data.data.map((img, index) => ({
        url: img.url,
        publicId: img.publicId,
        caption: "",
        order: uploadedImages.length + index,
      }));
      setUploadedImages([...uploadedImages, ...newImages]);
      toast.success(`${newImages.length} images uploaded successfully`);
    } catch (error) {
      toast.error("Failed to upload images");
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index) => {
    setUploadedImages(uploadedImages.filter((_, i) => i !== index));
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const vlogData = {
        ...data,
        tags: data.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag),
        images: uploadedImages,
      };

      const response = editMode
        ? await vlogAPI.updateVlog(id, vlogData)
        : await vlogAPI.createVlog(vlogData);

      if (response.data.success) {
        toast.success(
          editMode
            ? "Capsule updated successfully!"
            : "Capsule created successfully!",
        );
        // Redirect to the new vlog
        window.location.href = `/vlog/${response.data.data._id}`;
      }
    } catch (error) {
      toast.error(editMode ? "Failed to update capsule" : "Failed to create capsule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            {editMode ? "Edit Capsule" : "Create New Capsule"}
          </h1>
          <p className="text-xl text-[var(--theme-text-secondary)]">
            Share your story with the world through visual content
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-8 rounded-2xl"
          >
            <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <DocumentTextIcon className="w-6 h-6 mr-2 text-[var(--theme-accent)]" />
              Basic Information
            </h2>

            <div className="space-y-6">
              {/* Title */}
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-[var(--theme-text)] mb-2"
                >
                  Capsule Title *
                </label>
                <input
                  {...register("title", {
                    required: "Title is required",
                    minLength: {
                      value: 3,
                      message: "Title must be at least 3 characters",
                    },
                    maxLength: {
                      value: 100,
                      message: "Title cannot exceed 100 characters",
                    },
                  })}
                  type="text"
                  id="title"
                  className="glass-input"
                  placeholder="Enter a catchy title for your capsule"
                  disabled={loading}
                />
                {errors.title && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.title.message}
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium text-[var(--theme-text)] mb-2"
                >
                  Category *
                </label>
                <select
                  {...register("category", {
                    required: "Please select a category",
                  })}
                  id="category"
                  className="glass-input"
                  disabled={loading}
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.category.message}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-[var(--theme-text)] mb-2"
                >
                  Description *
                </label>
                <textarea
                  {...register("description", {
                    required: "Description is required",
                    minLength: {
                      value: 10,
                      message: "Description must be at least 10 characters",
                    },
                    maxLength: {
                      value: 2000,
                      message: "Description cannot exceed 2000 characters",
                    },
                  })}
                  id="description"
                  rows={4}
                  className="glass-input resize-none"
                  placeholder="Describe your capsule content..."
                  disabled={loading}
                />
                {errors.description && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.description.message}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--theme-text-secondary)]">
                  {watch("description")?.length || 0}/2000 characters
                </p>
              </div>
            </div>
          </motion.div>

          {/* Images Upload */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-8 rounded-2xl"
          >
            <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <PhotoIcon className="w-6 h-6 mr-2 text-[var(--theme-accent)]" />
              Images
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Upload Images
              </label>
              <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files)}
                  className="hidden"
                  id="image-upload"
                  disabled={uploadingImages || loading}
                />
                <label
                  htmlFor="image-upload"
                  className="cursor-pointer glass-hover inline-flex items-center px-6 py-3 rounded-lg"
                >
                  <PhotoIcon className="w-5 h-5 mr-2" />
                  {uploadingImages ? "Uploading..." : "Choose Images"}
                </label>
                <p className="mt-2 text-sm text-[var(--theme-text-secondary)]">
                  Upload multiple images to create a visual story. Max 10
                  images, 5MB each.
                </p>
              </div>
            </div>

            {/* Uploaded Images */}
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image.url}
                      alt={`Uploaded ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-8 rounded-2xl"
          >
            <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6">
              Content
            </h2>

            <div>
              <label
                htmlFor="content"
                className="block text-sm font-medium text-[var(--theme-text)] mb-2"
              >
                Full Content (Optional)
              </label>
              <textarea
                {...register("content", {
                  maxLength: {
                    value: 10000,
                    message: "Content cannot exceed 10000 characters",
                  },
                })}
                id="content"
                rows={8}
                className="glass-input resize-none"
                placeholder="Add detailed content, story, or additional information..."
                disabled={loading}
              />
              {errors.content && (
                <p className="mt-2 text-sm text-red-400">
                  {errors.content.message}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--theme-text-secondary)]">
                {watch("content")?.length || 0}/10000 characters
              </p>
            </div>
          </motion.div>

          {/* Tags and Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-8 rounded-2xl"
          >
            <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <TagIcon className="w-6 h-6 mr-2 text-[var(--theme-accent)]" />
              Tags & Settings
            </h2>

            <div className="space-y-6">
              {/* Tags */}
              <div>
                <label
                  htmlFor="tags"
                  className="block text-sm font-medium text-[var(--theme-text)] mb-2"
                >
                  Tags
                </label>
                <input
                  {...register("tags")}
                  type="text"
                  id="tags"
                  className="glass-input"
                  placeholder="technology, travel, lifestyle (separate with commas)"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-[var(--theme-text-secondary)]">
                  Add relevant tags to help others discover your content
                </p>
              </div>

              {/* Privacy Settings */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-[var(--theme-text)]">
                    Visibility
                  </h3>
                  <p className="text-xs text-[var(--theme-text-secondary)]">
                    Choose who can see your capsule
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      {...register("isPublic")}
                      type="radio"
                      value="true"
                      className="text-[var(--theme-accent)]"
                      disabled={loading}
                    />
                    <span className="ml-2 text-sm text-[var(--theme-text)]">
                      Public
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      {...register("isPublic")}
                      type="radio"
                      value="false"
                      className="text-[var(--theme-accent)]"
                      disabled={loading}
                    />
                    <span className="ml-2 text-sm text-[var(--theme-text)]">
                      Private
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Submit Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex justify-center"
          >
            <Button
              type="submit"
              size="lg"
              variant="primary"
              loading={loading || uploadingImages}
              className="px-12"
            >
              {editMode ? "Update Capsule" : "Publish Capsule"}
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
};

export default CreateCapsule;
