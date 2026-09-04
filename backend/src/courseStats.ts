import { invalidateCourseReviewInfoCache } from './helpers/course-review-info'

export async function refreshCourseStats(db: D1Database, courseId: number) {
  invalidateCourseReviewInfoCache()
  await db.prepare(`
    UPDATE courses SET
      review_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE course_id = ? AND is_hidden = 0
      ),
      review_avg = (
        SELECT AVG(rating)
        FROM reviews
        WHERE course_id = ? AND is_hidden = 0 AND rating > 0
      )
    WHERE id = ?
  `).bind(courseId, courseId, courseId).run()
}
