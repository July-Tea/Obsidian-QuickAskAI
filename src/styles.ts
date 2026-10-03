export const STYLES_CSS = `
.quick-ask-inline-container {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.quick-ask-loading {
  animation: pulse 0.6s ease-in-out infinite;
  font-weight: bold;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.quick-ask-mention-item:hover {
  background-color: var(--interactive-accent) !important;
  color: white !important;
}

.quick-ask-mention-item.selected {
  background-color: var(--interactive-accent);
  color: white;
}

.quick-ask-ai-fake-selection {
  background-color: var(--text-selection);
  opacity: 0.6;
}
`;
