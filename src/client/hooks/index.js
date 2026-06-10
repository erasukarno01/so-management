// hooks/index.js - Export all hooks
// Provides centralized access to all custom hooks

export { useToast } from './useToast';
export { useApi, useAsyncApi } from './useApi';
export { useFilters, useFilterData } from './useFilters';
export { useStats, useStatusStats, useGroupStats } from './useStats';
export { useLocalStorage } from './useLocalStorage';
export { useDebounce, useDebouncedCallback } from './useDebounce';
export { useToggle } from './useToggle';
export { useModal, useMultipleModals } from './useModal';
export { useAsync, useAsyncList } from './useAsync';
export { ErrorBoundary, ErrorProvider, useErrorHandler } from './ErrorBoundary';