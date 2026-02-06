import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { vlogAPI, uploadAPI } from "../services/api";
import { useUpdateVlog } from "../hooks/useVlogMutations";
import Button from "../components/UI/Button";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import toast from "react-hot-toast";
import {
  PhotoIcon,
  TagIcon,
  EyeIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const EditCapsule = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

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

  // Fetch vlog data
  const { data: vlog, isLoading: loadingVlog } = useQuery({
    queryKey: ["vlog", id],
    queryFn: () => vlogAPI.getVlog(id),
    select: (response) => response.data.data,
  });

  // Check authorization after vlog is loaded
  useEffect(() => {
    if (vlog && user && vlog.author._id !== user.id) {
      toast.error("You are not authorized to edit this vlog");
      navigate(`/vlog/${id}`);
    }
  }, [vlog, user, id, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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

  // Populate form with existing data
  useEffect(() => {
    if (vlog) {
      setValue("title", vlog.title);
      setValue("description", vlog.description);
      setValue("content", vlog.content || "");
      setValue("category", vlog.category);
      setValue("tags", vlog.tags?.join(", ") || "");
      setValue("isPublic", vlog.isPublic);
      setUploadedImages(vlog.images || []);
    }
  }, [vlog, setValue]);

  // Update mutation with optimistic updates
  const updateMutation = useUpdateVlog(id);

  const [imageError, setImageError] = useState("");
  const [tagError, setTagError] = useState("");

  const validateImageUpload = (files) => {
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const maxImages = 10;

    // Check if adding these images would exceed the maximum
    if (uploadedImages.length + files.length > maxImages) {
      setImageError(
        `Cannot upload more than ${maxImages} images total. You currently have ${uploadedImages.length} image(s).`,
      );
      return false;
    }

    // Validate each file
    for (let file of files) {
      if (!validTypes.includes(file.type)) {
        setImageError(
          `Invalid file type: ${file.name}. Only JPEG, PNG, GIF, WebP, and AVIF images are allowed.`,
        );
        return false;
      }
      if (file.size > maxSize) {
        setImageError(`File too large: ${file.name}. Maximum size is 5MB.`);
        return false;
      }
    }

    setImageError("");
    return true;
  };

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);

    // Validate files before uploading
    if (!validateImageUpload(filesArray)) {
      return;
    }

    setUploadingImages(true);
    try {
      const response = await uploadAPI.uploadMultiple(filesArray);
      const newImages = response.data.data.map((img, index) => ({
        url: img.url || img.secure_url,
        publicId: img.publicId || img.public_id,
        caption: "",
        order: uploadedImages.length + index,
      }));
      setUploadedImages([...uploadedImages, ...newImages]);
      setImageError("");
      toast.success(`${newImages.length} image(s) uploaded successfully`);
    } catch (error) {
      setImageError(error.response?.data?.error || "Failed to upload images");
      toast.error("Failed to upload images");
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index) => {
    const newImages = uploadedImages.filter((_, i) => i !== index);
    setUploadedImages(newImages);

    // Clear image error if we now have valid number of images
    if (newImages.length <= 10 && newImages.length > 0) {
      setImageError("");
    }
  };

  const validateTags = (tagsString) => {
    if (!tagsString || tagsString.trim() === "") {
      setTagError("");
      return true;
    }

    const tags = tagsString
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag);

    if (tags.length > 10) {
      setTagError("Maximum 10 tags allowed");
      return false;
    }

    for (let tag of tags) {
      if (tag.length > 30) {
        setTagError(`Tag "${tag}" exceeds 30 characters`);
        return false;
      }
    }

    setTagError("");
    return true;
  };

  const onSubmit = async (data) => {
    // Validate images
    if (uploadedImages.length === 0) {
      setImageError("At least one image is required");
      toast.error("Please upload at least one image");
      return;
    }

    if (uploadedImages.length > 10) {
      setImageError("Maximum 10 images allowed");
      toast.error("Maximum 10 images allowed");
      return;
    }

    // Validate tags
    if (!validateTags(data.tags)) {
      toast.error("Please fix tag validation errors");
      return;
    }

    const vlogData = {
      ...data,
      tags: data.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag),
      images: uploadedImages,
      isPublic: data.isPublic === "true" || data.isPublic === true,
    };

    updateMutation.mutate(vlogData);
  };

  if (loadingVlog) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading vlog..." />
      </div>
    );
  }

  if (!vlog) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--theme-text)] mb-2">
            Vlog Not Found
          </h1>
          <p className="text-[var(--theme-text-secondary)]">
            The vlog you&apos;re trying to edit doesn&apos;t exist
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-3 sm:mb-4">
            Edit Vlog
          </h1>
          <p className="text-lg sm:text-xl text-[var(--theme-text-secondary)]">
            Update your capsule content and settings
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-6 sm:p-8 rounded-2xl"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <DocumentTextIcon className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-[var(--theme-accent)]" />
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
                  disabled={updateMutation.isLoading}
                />
                {errors.title && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.title.message}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--theme-text-secondary)]">
                  {watch("title")?.length || 0}/100 characters
                </p>
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
                  disabled={updateMutation.isLoading}
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
                  disabled={updateMutation.isLoading}
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
            className="glass-card p-6 sm:p-8 rounded-2xl"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <PhotoIcon className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-[var(--theme-accent)]" />
              Images
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Upload New Images *
              </label>
              <div
                className={`border-2 border-dashed ${imageError ? "border-red-400" : "border-white/20"} rounded-xl p-6 sm:p-8 text-center transition-colors hover:border-white/30`}
              >
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/avif"
                  onChange={(e) => handleImageUpload(e.target.files)}
                  className="hidden"
                  id="image-upload"
                  disabled={
                    uploadingImages ||
                    updateMutation.isLoading ||
                    uploadedImages.length >= 10
                  }
                />
                <label
                  htmlFor="image-upload"
                  className={`${uploadedImages.length >= 10 ? "opacity-50 cursor-not-allowed" : "cursor-pointer glass-hover"} inline-flex items-center px-6 py-3 rounded-lg transition-all duration-200`}
                >
                  <PhotoIcon className="w-5 h-5 mr-2" />
                  {uploadingImages
                    ? "Uploading..."
                    : uploadedImages.length >= 10
                      ? "Maximum Images Reached"
                      : "Add More Images"}
                </label>
                <p className="mt-3 text-sm text-[var(--theme-text-secondary)]">
                  Upload additional images. Max 10 images total, 5MB each.
                  Accepted formats: JPEG, PNG, GIF, WebP, AVIF.
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--theme-text)]">
                  Current: {uploadedImages.length}/10 images
                </p>
              </div>
              {imageError && (
                <p className="mt-3 text-sm text-red-400 font-medium">
                  {imageError}
                </p>
              )}
            </div>

            {/* Uploaded Images */}
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {uploadedImages.map((image, index) => (
                  <motion.div
                    key={index}
                    className="relative group"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="relative overflow-hidden rounded-xl border border-white/10 hover:border-white/30 transition-all duration-200">
                      <img
                        src={image.url}
                        alt={`Image ${index + 1}`}
                        className="w-full h-32 object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center hover:scale-110 shadow-lg"
                      disabled={updateMutation.isLoading}
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 sm:p-8 rounded-2xl"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--theme-text)] mb-6">
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
                disabled={updateMutation.isLoading}
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
            className="glass-card p-6 sm:p-8 rounded-2xl"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
              <TagIcon className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-[var(--theme-accent)]" />
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
                  {...register("tags", {
                    validate: (value) => {
                      if (!value || value.trim() === "") return true;

                      const tags = value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter((tag) => tag);

                      if (tags.length > 10) {
                        return "Maximum 10 tags allowed";
                      }

                      for (let tag of tags) {
                        if (tag.length > 30) {
                          return `Tag "${tag}" exceeds 30 characters`;
                        }
                      }

                      return true;
                    },
                  })}
                  type="text"
                  id="tags"
                  className="glass-input"
                  placeholder="technology, travel, lifestyle (separate with commas)"
                  disabled={updateMutation.isLoading}
                  onChange={(e) => {
                    validateTags(e.target.value);
                  }}
                />
                {(errors.tags || tagError) && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.tags?.message || tagError}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--theme-text-secondary)]">
                  Add relevant tags to help others discover your content. Max 10
                  tags, 30 characters each.
                </p>
              </div>

              {/* Privacy Settings */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-[var(--theme-text)] flex items-center">
                    <EyeIcon className="w-4 h-4 mr-2" />
                    Visibility
                  </h3>
                  <p className="text-xs text-[var(--theme-text-secondary)]">
                    Choose who can see your capsule
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      {...register("isPublic")}
                      type="radio"
                      value="true"
                      className="text-[var(--theme-accent)]"
                      disabled={updateMutation.isLoading}
                    />
                    <span className="ml-2 text-sm text-[var(--theme-text)]">
                      Public
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      {...register("isPublic")}
                      type="radio"
                      value="false"
                      className="text-[var(--theme-accent)]"
                      disabled={updateMutation.isLoading}
                    />
                    <span className="ml-2 text-sm text-[var(--theme-text)]">
                      Private
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row justify-center gap-4"
          >
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => navigate(`/vlog/${id}`)}
              disabled={updateMutation.isLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant="primary"
              loading={updateMutation.isLoading || uploadingImages}
              className="w-full sm:w-auto px-12 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              Update Capsule
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
};

export default EditCapsule;
