import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Hash-based history is required for Capacitor because the WebView serves
// the app from a file:// URL where the path segment is not reliable.
const hashHistory = createHashHistory();

export const getRouter = (queryClient: QueryClient) => {
  const router = createRouter({
    history: hashHistory,
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
