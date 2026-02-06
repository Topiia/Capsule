import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteConfirmModal from "./DeleteConfirmModal";

describe("DeleteConfirmModal", () => {
  it("renders with danger type by default", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure you want to delete this capsule?"
      />,
    );

    expect(screen.getByText("Delete Capsule")).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to delete this capsule?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders with warning type", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Warning"
        message="This is a warning"
        type="warning"
      />,
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("renders with info type", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Information"
        message="This is information"
        type="info"
      />,
    );

    expect(screen.getByText("Information")).toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure?"
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure?"
      />,
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows loading state on confirm button", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure?"
        isLoading={true}
      />,
    );

    const deleteButton = screen.getByText("Delete").closest("button");
    expect(deleteButton).toBeDisabled();
  });

  it("uses custom button text", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure?"
        confirmText="Yes, Delete"
        cancelText="No, Keep It"
      />,
    );

    expect(screen.getByText("Yes, Delete")).toBeInTheDocument();
    expect(screen.getByText("No, Keep It")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    const { container } = render(
      <DeleteConfirmModal
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Capsule"
        message="Are you sure?"
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
