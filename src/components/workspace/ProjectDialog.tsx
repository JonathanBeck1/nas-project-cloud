"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderPlus, X } from "lucide-react";

export type ProjectDialogInput = {
  name: string;
  description: string;
};

type ProjectDialogProps = {
  onCreate: (project: ProjectDialogInput) => void | Promise<void>;
};

export function ProjectDialog({ onCreate }: ProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const resetFields = () => {
    setName("");
    setDescription("");
    setStatusMessage("");
    setErrorMessage("");
    setIsSubmitting(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetFields();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedName = name.trim();
    setStatusMessage("");
    setErrorMessage("");

    if (!trimmedName) {
      setStatusMessage("Project name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      await onCreate({ name: trimmedName, description });
      handleOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create project");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90"
        >
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Project
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-panel p-5 text-ink shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">Create project</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted">
                Add a workspace project for organizing uploaded files.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line text-muted transition hover:border-muted hover:text-ink"
                aria-label="Close"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label htmlFor="project-name" className="text-sm font-semibold text-ink">
                Project name
              </label>
              <input
                id="project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setStatusMessage("");
                  setErrorMessage("");
                }}
                className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
                autoComplete="off"
                aria-describedby="project-dialog-status project-dialog-error"
                aria-invalid={Boolean(statusMessage || errorMessage)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="project-description" className="text-sm font-semibold text-ink">
                Description
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24 w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
                disabled={isSubmitting}
              />
            </div>

            {statusMessage ? (
              <p id="project-dialog-status" role="status" className="text-sm font-medium text-accent">
                {statusMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <p id="project-dialog-error" role="alert" className="text-sm font-medium text-red-600">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create project"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
