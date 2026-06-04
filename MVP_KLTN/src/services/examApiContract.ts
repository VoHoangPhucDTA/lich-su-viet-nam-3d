/**
 * Exam API Contract
 * 
 * Defines the future backend API integration for the THPT Exam module.
 * Expected to be implemented in Spring Boot.
 * 
 * Target Endpoints:
 * 
 * 1. POST /api/exams/create
 *    Request:
 *    {
 *      config: ExamConfig,
 *      userId?: string
 *    }
 *    Response: ExamSession
 * 
 * 2. GET /api/exams/:id
 *    Response: ExamSession
 * 
 * 3. POST /api/exams/:id/submit
 *    Request:
 *    {
 *       answers: ExamAnswer[]
 *    }
 *    Response: ExamResult
 * 
 * 4. GET /api/exams/history?userId=:userId
 *    Response: ExamResult[]
 * 
 * 5. GET /api/exams/result/:id
 *    Response: { result: ExamResult; session: ExamSession }
 * 
 * 6. GET /api/exams/:id/export/pdf
 *    Response: PDF File Stream (application/pdf)
 * 
 * 7. GET /api/exams/:id/export/excel
 *    Response: Excel File Stream (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */
export {};
