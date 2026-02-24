/**
 * Transforms an API vlog response object into a flat form data shape 
 * expected by the EditCapsule and CreateCapsule forms.
 * Layer A: Pure function for property testing without DOM/React state.
 */
export const mapVlogToFormData = (vlog) => {
  if (!vlog) return null;
  
  return {
    title: vlog.title || "",
    description: vlog.description || "",
    content: vlog.content || "",
    category: vlog.category || "",
    tags: Array.isArray(vlog.tags) ? vlog.tags.join(", ") : "",
    isPublic: vlog.isPublic ?? true,
    images: vlog.images || [],
  };
};
