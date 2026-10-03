export const STYLES_CSS = `
.quick-ask-ai-modal {
  max-width: 600px;
}

.quick-ask-ai-modal h2 {
  margin-bottom: 15px;
}

.quick-ask-ai-modal textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 14px;
  background-color: var(--background-primary);
  color: var(--text-normal);
  resize: vertical;
}

.quick-ask-ai-modal textarea:focus {
  outline: none;
  border-color: var(--interactive-accent);
  box-shadow: 0 0 0 2px var(--interactive-accent, rgba(0, 0, 0, 0.1));
}

.quick-ask-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 15px;
}

.quick-ask-buttons button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  background-color: var(--background-modifier);
  color: var(--text-normal);
  transition: background-color 0.2s ease;
}

.quick-ask-buttons button:hover:not(:disabled) {
  background-color: var(--background-modifier-hover);
}

.quick-ask-buttons button.mod-cta {
  background-color: var(--interactive-accent);
  color: white;
}

.quick-ask-buttons button.mod-cta:hover:not(:disabled) {
  background-color: var(--interactive-accent-hover, var(--interactive-accent));
  opacity: 0.9;
}

.quick-ask-buttons button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.quick-ask-buttons button.is-loading {
  position: relative;
  color: transparent;
}

.quick-ask-buttons button.is-loading::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  top: 50%;
  left: 50%;
  margin-left: -7px;
  margin-top: -7px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: quick-ask-spin 0.6s linear infinite;
}

@keyframes quick-ask-spin {
  to {
    transform: rotate(360deg);
  }
}

.quick-ask-status {
  margin-top: 10px;
  font-size: 14px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-ask-status::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--interactive-accent);
  border-right-color: transparent;
  border-radius: 50%;
  animation: quick-ask-spin 0.6s linear infinite;
}

.quick-ask-mention-list {
  position: absolute;
  background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.quick-ask-mention-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.quick-ask-mention-item:hover {
  background-color: var(--background-modifier-hover);
}

.quick-ask-mention-item.selected {
  background-color: var(--interactive-accent);
  color: white;
}

.quick-ask-mention-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
`;
