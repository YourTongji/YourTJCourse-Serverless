import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export const routes: RouteConfig = [
  layout("components/Layout.tsx", [
    index("routes/_index.tsx"),
    route("courses", "routes/courses.tsx"),
    route("course/:id", "routes/course.$id.tsx"),
    route("course/:id/write", "routes/course.$id_.write.tsx"),
  ]),
];
