import { describe, expect, test } from 'vitest'
import { match } from './matcher.ts'

const Home    = { component: 'Home' }
const Admin   = { component: 'Admin' }
const Students = { component: 'Students' }
const Student  = { component: 'Student' }
const Lessons  = { component: 'Lessons' }
const Portal  = { component: 'Portal' }

const routes = {
  '':      Home,
  admin: {
    '':      Admin,
    students: {
      '':    Students,
      _id: {
        '':  Student,
        lessons: {
          '': Lessons,
        },
      },
    },
  },
  portal: {
    '': Portal,
  },
}

describe('static routes', () => {
  test('root', () => {
    const m = match(routes, '/')
    expect(m?.leaf).toEqual(Home)
    expect(m?.params).toEqual({})
  })

  test('/admin', () => {
    const m = match(routes, '/admin')
    expect(m?.leaf).toEqual(Admin)
  })

  test('/admin/students', () => {
    const m = match(routes, '/admin/students')
    expect(m?.leaf).toEqual(Students)
  })

  test('/portal', () => {
    const m = match(routes, '/portal')
    expect(m?.leaf).toEqual(Portal)
  })
})

describe('dynamic segments', () => {
  test('/admin/students/:id', () => {
    const m = match(routes, '/admin/students/abc123')
    expect(m?.leaf).toEqual(Student)
    expect(m?.params).toEqual({ id: 'abc123' })
  })

  test('/admin/students/:id/lessons', () => {
    const m = match(routes, '/admin/students/abc123/lessons')
    expect(m?.leaf).toEqual(Lessons)
    expect(m?.params).toEqual({ id: 'abc123' })
  })
})

describe('layout collection', () => {
  test('root layout included for nested routes', () => {
    const m = match(routes, '/admin')
    expect(m?.layouts).toContainEqual(Home)
  })

  test('intermediate layouts accumulated', () => {
    const m = match(routes, '/admin/students/abc123')
    expect(m?.layouts).toContainEqual(Home)
    expect(m?.layouts).toContainEqual(Admin)
  })

  test('layout order is outermost first', () => {
    const m = match(routes, '/admin/students/abc123')
    const components = m?.layouts.map(l => l.component)
    expect(components?.indexOf('Home')).toBeLessThan(components?.indexOf('Admin') ?? -1)
  })
})

describe('no match', () => {
  test('unknown path', () => {
    expect(match(routes, '/unknown')).toBeNull()
  })

  test('too deep', () => {
    expect(match(routes, '/portal/extra')).toBeNull()
  })

  test('double slashes are normalized', () => {
    // filter(Boolean) normalizes double slashes — /admin//students = /admin/students
    const m = match(routes, '/admin//students')
    expect(m?.leaf).toEqual(Students)
  })
})

describe('param parsers', () => {
  const routesWithParser = {
    _id: {
      params: { id: (s: string) => (s.length > 2 ? s : null) },
      '': Student,
    },
  }

  test('passes when parser returns value', () => {
    const m = match(routesWithParser, '/abc')
    expect(m?.leaf).toEqual(Student)
    expect(m?.params.id).toBe('abc')
  })

  test('returns null when parser returns null', () => {
    expect(match(routesWithParser, '/ab')).toBeNull()
  })
})
