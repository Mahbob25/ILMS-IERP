import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { WizardPage } from '../../pages/WizardPage'
import { ensureAuthHeader } from '../../fixtures/tokens'

const API_BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Student Enrollment Wizard (Authenticated)', () => {
  let dashboard: DashboardPage
  let wizard: WizardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    wizard = new WizardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
    await wizard.goto()
  })

  test('displays the wizard with all four steps', async ({ page }) => {
    await wizard.expectWizardReady()
    await page.screenshot({ path: 'test-results/artifacts/wizard-step1.png' })
  })

  test('registers an existing student, enrolls, and skips payment', async ({
    page,
    request,
  }) => {
    const headers = await ensureAuthHeader('superadmin')

    // Pick an existing student to reuse
    const studentsRes = await request.get(`${API_BASE_URL}/academic/students?limit=20`, { headers })
    const students = (await studentsRes.json()).items || []
    if (students.length === 0) {
      test.skip(true, 'No students found to pick')
      return
    }
    const existing = students[0]

    // Find a course that has an open (non-completed/cancelled) section
    const [coursesRes, sectionsRes] = await Promise.all([
      request.get(`${API_BASE_URL}/academic/courses?limit=50`, { headers }),
      request.get(`${API_BASE_URL}/academic/course-sections?limit=50`, { headers }),
    ])
    const courses = (await coursesRes.json()).items || []
    const sections = (await sectionsRes.json()).items || []
    const openCourse = courses.find((c: any) =>
      sections.some(
        (s: any) =>
          s.course_id === c.id && !['completed', 'cancelled'].includes(s.status),
      ),
    )
    if (!openCourse) {
      test.skip(true, 'No open sections found to enroll into')
      return
    }

    await wizard.searchStudent(existing.student_code)
    await wizard.pickFirstStudentResult()
    await wizard.expectStudentLocked()
    await wizard.goNext()
    await wizard.expectEnrollmentStep()

    await wizard.selectSection(openCourse.name)
    await wizard.goNext() // submits enrollment -> payment step

    await wizard.expectPaymentStep()
    await wizard.skipPayment()
    await wizard.expectCompletion()
    await page.screenshot({ path: 'test-results/artifacts/wizard-complete-skip.png' })
  })

  test('creates a new student, enrolls, and pays with receipt', async ({
    page,
    request,
  }) => {
    const headers = await ensureAuthHeader('superadmin')

    const [coursesRes, sectionsRes] = await Promise.all([
      request.get(`${API_BASE_URL}/academic/courses?limit=50`, { headers }),
      request.get(`${API_BASE_URL}/academic/course-sections?limit=50`, { headers }),
    ])
    const courses = (await coursesRes.json()).items || []
    const sections = (await sectionsRes.json()).items || []
    const openCourse = courses.find((c: any) =>
      sections.some(
        (s: any) =>
          s.course_id === c.id && !['completed', 'cancelled'].includes(s.status),
      ),
    )
    if (!openCourse) {
      test.skip(true, 'No active sections found to enroll into')
      return
    }

    const code = `E2E${Date.now()}`
    await wizard.startCreateStudent()
    await wizard.fillStudentForm(code, `E2E Student ${code}`, `${code}@example.com`)
    await wizard.saveStudent()
    await wizard.expectStudentLocked()
    await wizard.goNext()
    await wizard.expectEnrollmentStep()

    await wizard.selectSection(openCourse.name)
    await wizard.goNext() // submits enrollment -> payment step

    await wizard.expectPaymentStep()
    await wizard.goNext() // submits payment -> receipt + completion
    await wizard.expectReceiptModal()
    await page.screenshot({ path: 'test-results/artifacts/wizard-receipt.png' })
    await wizard.closeReceipt()
    await wizard.expectCompletion()
  })
})