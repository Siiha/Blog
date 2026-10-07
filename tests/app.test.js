const request = require('supertest');

jest.mock('../database', () => ({
  get: jest.fn(),
  run: jest.fn(),
  all: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  compareSync: jest.fn(),
  hashSync: jest.fn(() => 'hashed-password'),
}));

const app = require('../app');
const db = require('../database');
const bcrypt = require('bcrypt');

describe('Blog application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.get.mockImplementation((query, values, callback) => callback(null, null));
    db.run.mockImplementation((query, values, callback) => callback(null));
    db.all.mockImplementation((query, callback) => callback(null, []));
  });

  test('shows the login page', async () => {
    const response = await request(app).get('/auth/login');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<h1>Login</h1>');
  });

  test('redirects unauthenticated users away from the home page', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  test('logs in a user with valid credentials', async () => {
    db.get.mockImplementation((query, values, callback) => {
      callback(null, { username: 'alice', password: 'hashed-password' });
    });
    bcrypt.compareSync.mockReturnValue(true);

    const response = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ username: 'alice', password: 'secret' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(response.headers['set-cookie'][0]).toContain('sessionId=');
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE users SET sessionId = ? WHERE username = ?',
      expect.any(Array),
      expect.any(Function),
    );
  });

  test('renders an error for invalid credentials', async () => {
    db.get.mockImplementation((query, values, callback) => {
      callback(null, { username: 'alice', password: 'hashed-password' });
    });
    bcrypt.compareSync.mockReturnValue(false);

    const response = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ username: 'alice', password: 'wrong' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Invalid username or password');
    expect(db.run).not.toHaveBeenCalled();
  });

  test('registers a new user and redirects to login', async () => {
    const response = await request(app)
      .post('/auth/register')
      .type('form')
      .send({ username: 'alice', password: 'secret' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO users (username, password, sessionId) VALUES (?, ?, ?)',
      ['alice', 'hashed-password', 0],
      expect.any(Function),
    );
  });

  test('creates a post for an authenticated user', async () => {
    db.get.mockImplementation((query, values, callback) => {
      callback(null, { username: 'alice', sessionId: 'valid-session' });
    });

    const response = await request(app)
      .post('/new-post')
      .set('Cookie', 'sessionId=valid-session')
      .type('form')
      .send({ title: 'Test post', content: 'Test content' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO posts (title, content) VALUES (?, ?)',
      ['Test post', 'Test content'],
      expect.any(Function),
    );
  });
});