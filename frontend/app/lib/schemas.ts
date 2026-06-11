import { z } from "zod";

export const reviewSchema = z.object({
  course_id: z.number().positive(),
  rating: z.number().min(0).max(5),
  comment: z.string().min(1, "评价内容不能为空").max(5000),
  semester: z.string().min(1, "请选择学期"),
  reviewer_name: z.string().optional(),
  reviewer_avatar: z.string().optional(),
  walletUserHash: z.string().optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export const courseSearchSchema = z.object({
  q: z.string().optional(),
  departments: z.string().optional(),
  onlyWithReviews: z.string().optional(),
  page: z.string().optional(),
  courseName: z.string().optional(),
  courseCode: z.string().optional(),
  teacherName: z.string().optional(),
  teacherCode: z.string().optional(),
  campus: z.string().optional(),
  faculty: z.string().optional(),
});

export type CourseSearchParams = z.infer<typeof courseSearchSchema>;
