/**
 * **Feature: vlog-edit-delete, Property 2: Edit form pre-population**
 * **Validates: Requirements 1.2**
 * 
 * Property: For any vlog, when navigating to the edit page, all form fields 
 * should be populated with the vlog's current data (title, description, 
 * category, tags, images)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import EditVlog from '../pages/EditVlog'
import * as fc from 'fast-check'
import { vlogAPI } from '../services/api'

// Mock the API
vi.mock('../services/api', () => ({
  vlogAPI: {
    getVlog: vi.fn(),
    updateVlog: vi.fn()
  },
  uploadAPI: {
    uploadMultiple: vi.fn()
  },
  authAPI: {
    setAuthHeader: vi.fn(),
    getMe: vi.fn()
  }
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
global.localStorage = localStorageMock

describe('EditVlog Form Pre-population Property Test', () => {
  let queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    vi.clearAllMocks()
  })

  // Generator for MongoDB ObjectId (24 character hex string)
  const objectIdArbitrary = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 24, maxLength: 24 })
    .map(arr => arr.map(n => n.toString(16)).join(''))

  // Generator for valid vlog data
  const vlogArbitrary = fc.record({
    _id: objectIdArbitrary,
    title: fc.string({ minLength: 3, maxLength: 100 }),
    description: fc.string({ minLength: 10, maxLength: 2000 }),
    content: fc.option(fc.string({ maxLength: 10000 }), { nil: '' }),
    category: fc.constantFrom(
      'technology', 'travel', 'lifestyle', 'food', 'fashion',
      'fitness', 'music', 'art', 'business', 'education',
      'entertainment', 'gaming', 'sports', 'health', 'science',
      'photography', 'diy', 'other'
    ),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
    images: fc.array(
      fc.record({
        url: fc.webUrl(),
        publicId: fc.string({ minLength: 10, maxLength: 50 }),
        caption: fc.string({ maxLength: 200 }),
        order: fc.nat()
      }),
      { maxLength: 10 }
    ),
    isPublic: fc.boolean(),
    author: fc.record({
      _id: objectIdArbitrary,
      username: fc.string({ minLength: 3, maxLength: 30 }),
      email: fc.emailAddress()
    }),
    views: fc.nat(),
    likes: fc.array(objectIdArbitrary),
    createdAt: fc.date(),
    updatedAt: fc.date()
  })

  const renderEditVlog = (vlogId, userId) => {
    // Mock localStorage to return a token
    localStorageMock.getItem.mockReturnValue('mock-token')
    
    // Mock authAPI.getMe to return a user
    const { authAPI } = require('../services/api')
    authAPI.getMe.mockResolvedValue({
      data: {
        user: {
          id: userId,
          username: 'testuser',
          email: 'test@example.com'
        }
      }
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/vlog/${vlogId}/edit`]}>
            <Routes>
              <Route path="/vlog/:id/edit" element={<EditVlog />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )
  }

  it('should pre-populate all form fields with vlog data for any vlog', async () => {
    await fc.assert(
      fc.asyncProperty(vlogArbitrary, async (vlog) => {
        // Setup: Mock API to return the generated vlog
        vlogAPI.getVlog.mockResolvedValue({
          data: { data: vlog }
        })

        // Render the component with the vlog author as the current user
        const { container } = renderEditVlog(vlog._id, vlog.author._id)

        // Wait for the vlog data to load
        await waitFor(() => {
          expect(vlogAPI.getVlog).toHaveBeenCalledWith(vlog._id)
        })

        // Wait for form to be populated
        await waitFor(() => {
          const titleInput = container.querySelector('#title')
          expect(titleInput).toBeTruthy()
          expect(titleInput.value).toBe(vlog.title)
        })

        // Verify all form fields are populated correctly
        const titleInput = container.querySelector('#title')
        const descriptionInput = container.querySelector('#description')
        const contentInput = container.querySelector('#content')
        const categoryInput = container.querySelector('#category')
        const tagsInput = container.querySelector('#tags')

        // Check title
        expect(titleInput.value).toBe(vlog.title)

        // Check description
        expect(descriptionInput.value).toBe(vlog.description)

        // Check content
        expect(contentInput.value).toBe(vlog.content || '')

        // Check category
        expect(categoryInput.value).toBe(vlog.category)

        // Check tags (should be comma-separated)
        const expectedTags = vlog.tags?.join(', ') || ''
        expect(tagsInput.value).toBe(expectedTags)

        // Check images are displayed
        if (vlog.images && vlog.images.length > 0) {
          await waitFor(() => {
            const images = container.querySelectorAll('img[alt^="Image"]')
            expect(images.length).toBe(vlog.images.length)
          })
        }

        // Check isPublic radio buttons
        const publicRadio = container.querySelector('input[type="radio"][value="true"]')
        const privateRadio = container.querySelector('input[type="radio"][value="false"]')
        
        if (vlog.isPublic) {
          expect(publicRadio.checked).toBe(true)
        } else {
          expect(privateRadio.checked).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('should handle vlogs with empty optional fields', async () => {
    const objectIdArbitrary = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 24, maxLength: 24 })
      .map(arr => arr.map(n => n.toString(16)).join(''))
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          _id: objectIdArbitrary,
          title: fc.string({ minLength: 3, maxLength: 100 }),
          description: fc.string({ minLength: 10, maxLength: 2000 }),
          content: fc.constant(''),
          category: fc.constantFrom('technology', 'travel', 'lifestyle'),
          tags: fc.constant([]),
          images: fc.constant([]),
          isPublic: fc.boolean(),
          author: fc.record({
            _id: objectIdArbitrary,
            username: fc.string({ minLength: 3, maxLength: 30 }),
            email: fc.emailAddress()
          }),
          views: fc.nat(),
          likes: fc.array(objectIdArbitrary),
          createdAt: fc.date(),
          updatedAt: fc.date()
        }),
        async (vlog) => {
          vlogAPI.getVlog.mockResolvedValue({
            data: { data: vlog }
          })

          const { container } = renderEditVlog(vlog._id, vlog.author._id)

          await waitFor(() => {
            expect(vlogAPI.getVlog).toHaveBeenCalledWith(vlog._id)
          })

          await waitFor(() => {
            const titleInput = container.querySelector('#title')
            expect(titleInput).toBeTruthy()
            expect(titleInput.value).toBe(vlog.title)
          })

          const contentInput = container.querySelector('#content')
          const tagsInput = container.querySelector('#tags')

          // Empty content should be empty string
          expect(contentInput.value).toBe('')

          // Empty tags should be empty string
          expect(tagsInput.value).toBe('')

          // No images should be displayed
          const images = container.querySelectorAll('img[alt^="Image"]')
          expect(images.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle vlogs with maximum allowed values', async () => {
    const objectIdArbitrary = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 24, maxLength: 24 })
      .map(arr => arr.map(n => n.toString(16)).join(''))
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          _id: objectIdArbitrary,
          title: fc.string({ minLength: 100, maxLength: 100 }),
          description: fc.string({ minLength: 2000, maxLength: 2000 }),
          content: fc.string({ minLength: 10000, maxLength: 10000 }),
          category: fc.constantFrom('technology', 'travel'),
          tags: fc.array(fc.string({ minLength: 30, maxLength: 30 }), { minLength: 10, maxLength: 10 }),
          images: fc.array(
            fc.record({
              url: fc.webUrl(),
              publicId: fc.string({ minLength: 10, maxLength: 50 }),
              caption: fc.string({ maxLength: 200 }),
              order: fc.nat()
            }),
            { minLength: 10, maxLength: 10 }
          ),
          isPublic: fc.boolean(),
          author: fc.record({
            _id: objectIdArbitrary,
            username: fc.string({ minLength: 3, maxLength: 30 }),
            email: fc.emailAddress()
          }),
          views: fc.nat(),
          likes: fc.array(objectIdArbitrary),
          createdAt: fc.date(),
          updatedAt: fc.date()
        }),
        async (vlog) => {
          vlogAPI.getVlog.mockResolvedValue({
            data: { data: vlog }
          })

          const { container } = renderEditVlog(vlog._id, vlog.author._id)

          await waitFor(() => {
            expect(vlogAPI.getVlog).toHaveBeenCalledWith(vlog._id)
          })

          await waitFor(() => {
            const titleInput = container.querySelector('#title')
            expect(titleInput).toBeTruthy()
            expect(titleInput.value).toBe(vlog.title)
          })

          const titleInput = container.querySelector('#title')
          const descriptionInput = container.querySelector('#description')
          const contentInput = container.querySelector('#content')
          const tagsInput = container.querySelector('#tags')

          // All fields should be populated with maximum values
          expect(titleInput.value.length).toBe(100)
          expect(descriptionInput.value.length).toBe(2000)
          expect(contentInput.value.length).toBe(10000)
          expect(tagsInput.value.split(', ').length).toBe(10)

          // Maximum images should be displayed
          await waitFor(() => {
            const images = container.querySelectorAll('img[alt^="Image"]')
            expect(images.length).toBe(10)
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})
