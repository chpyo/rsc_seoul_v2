import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/literature")({
  component: LiteratureLayout,
});

function LiteratureLayout() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Outlet />
    </div>
  );
}
