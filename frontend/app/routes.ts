import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("components/Layout.tsx", [
    index("routes/_index.tsx"),
    route("courses", "routes/courses.tsx"),
    route("course/:id", "routes/course.$id.tsx"),
    route("course/:id/write", "routes/course.$id_.write.tsx"),
    route("about", "routes/about.tsx"),
    route("faq", "routes/faq.tsx"),
    route("feedback", "routes/feedback.tsx"),
    route("schedule", "routes/schedule.tsx"),
    route("admin", "routes/admin.tsx"),
  ]),
] satisfies RouteConfig;
