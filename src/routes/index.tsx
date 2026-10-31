import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/stillroom/studio";

export const Route = createFileRoute("/")({ component: Studio });
