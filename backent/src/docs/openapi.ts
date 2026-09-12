const success = {
  type: 'object', required: ['success', 'data', 'message'], properties: {
    success: { type: 'boolean', example: true }, data: { nullable: true }, message: { type: 'string', example: 'Success' },
  },
};
const failure = {
  type: 'object', required: ['success', 'error'], properties: {
    success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string', example: 'Validation failed' }, details: { nullable: true } } },
  },
};
const jsonResponse = (description = 'Successful response', status = '200') => ({
  [status]: { description, content: { 'application/json': { schema: success, example: { success: true, data: {}, message: description } } } },
  '401': { description: 'Authentication failed', content: { 'application/json': { schema: failure } } },
  '422': { description: 'Validation failed', content: { 'application/json': { schema: failure } } },
  '500': { description: 'Unexpected server error', content: { 'application/json': { schema: failure } } },
});
const bearer = [{ bearerAuth: [] }];
const operation = (summary: string, tags: string[], options: Record<string, unknown> = {}) => ({ summary, tags, responses: jsonResponse(), ...options });
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '242a6f31-22db-4c37-9eee-4bf643af34f8' };
const animeId = { ...id, name: 'animeId' };
const episodeId = { ...id, name: 'episodeId' };
const page = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
];
const body = (schema: Record<string, unknown>, example: Record<string, unknown>) => ({
  required: true, content: { 'application/json': { schema, example } },
});

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Anime Platform API', version: '1.0.0', description: 'Raw-SQL Express backend API for the Anime Streaming Platform.' },
  servers: [{ url: '/api/v1', description: 'Current API server' }],
  tags: [
    { name: 'Authentication' }, { name: 'Users' }, { name: 'Anime' }, { name: 'Episodes' },
    { name: 'Media' }, { name: 'Catalog' }, { name: 'Administration' }, { name: 'Health' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access JWT returned by login or registration.' } },
    schemas: { SuccessResponse: success, ErrorResponse: failure },
  },
  paths: {
    '/auth/register': { post: operation('Register a user account', ['Authentication'], { requestBody: body({ type: 'object', required: ['email', 'password', 'displayName'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 12 }, displayName: { type: 'string' } } }, { email: 'viewer@example.com', password: 'long-secure-password', displayName: 'Viewer' }), responses: jsonResponse('Registration successful', '201') }) },
    '/auth/login': { post: operation('Log in', ['Authentication'], { requestBody: body({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } }, { email: 'viewer@example.com', password: 'long-secure-password' }) }) },
    '/auth/refresh': { post: operation('Refresh access token', ['Authentication'], { requestBody: body({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }, { refreshToken: 'eyJhbGciOiJIUzI1NiJ9...' }) }) },
    '/auth/logout': { post: operation('Invalidate all active sessions', ['Authentication'], { security: bearer, requestBody: body({ type: 'object', additionalProperties: false }, {}) }) },
    '/users/me': {
      get: operation('Get current profile', ['Users'], { security: bearer }),
      patch: operation('Update current profile', ['Users'], { security: bearer, requestBody: body({ type: 'object', properties: { displayName: { type: 'string' } } }, { displayName: 'New display name' }) }),
    },
    '/users/me/avatar': { post: operation('Upload avatar image', ['Users'], { security: bearer, requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP; maximum 5 MB.' } } } } } } }) },
    '/users/me/favorites': { get: operation('List favorites', ['Users'], { security: bearer }) },
    '/users/me/favorites/{animeId}': {
      post: operation('Add favorite', ['Users'], { security: bearer, parameters: [animeId], requestBody: body({ type: 'object' }, {}), responses: jsonResponse('Favorite added', '201') }),
      delete: operation('Remove favorite', ['Users'], { security: bearer, parameters: [animeId] }),
    },
    '/users/me/history': { get: operation('List watch history', ['Users'], { security: bearer }) },
    '/users/me/history/{episodeId}': { put: operation('Update watch progress', ['Users'], { security: bearer, parameters: [episodeId], requestBody: body({ type: 'object', required: ['positionSeconds'], properties: { positionSeconds: { type: 'integer', minimum: 0 }, completed: { type: 'boolean' } } }, { positionSeconds: 420, completed: false }) }) },
    '/anime': {
      get: operation('Search published anime', ['Anime'], { parameters: [...page, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'genre', in: 'query', schema: { type: 'string' } }, { name: 'tag', in: 'query', schema: { type: 'string' } }] }),
      post: operation('Create anime', ['Anime'], { security: bearer, requestBody: body({ type: 'object', required: ['title'], properties: { title: { type: 'string' }, slug: { type: 'string' }, synopsis: { type: 'string' }, releaseYear: { type: 'integer' }, studioId: { type: 'string', format: 'uuid' }, genreIds: { type: 'array', items: { type: 'string', format: 'uuid' } }, tagIds: { type: 'array', items: { type: 'string', format: 'uuid' } } } }, { title: 'Sky Lanterns', synopsis: 'A city above the clouds.', releaseYear: 2026, genreIds: [] }), responses: jsonResponse('Anime created', '201') }),
    },
    '/anime/mine': { get: operation('List owned anime including drafts', ['Anime'], { security: bearer, parameters: page }) },
    '/anime/{identifier}': {
      get: operation('Get anime by slug or ID', ['Anime'], { parameters: [{ name: 'identifier', in: 'path', required: true, schema: { type: 'string' }, example: 'sky-lanterns' }] }),
      patch: operation('Update anime', ['Anime'], { security: bearer, parameters: [id], requestBody: body({ type: 'object', properties: { title: { type: 'string' }, slug: { type: 'string' }, synopsis: { type: 'string' }, releaseYear: { type: 'integer' }, studioId: { type: ['string', 'null'], format: 'uuid' }, genreIds: { type: 'array', items: { type: 'string', format: 'uuid' } }, tagIds: { type: 'array', items: { type: 'string', format: 'uuid' } } } }, { synopsis: 'An updated synopsis.' }) }),
      delete: operation('Delete anime', ['Anime'], { security: bearer, parameters: [id] }),
    },
    '/anime/{id}/publish': { post: operation('Publish anime', ['Anime'], { security: bearer, parameters: [id], requestBody: body({ type: 'object' }, {}) }) },
    '/anime/{id}/assets/{kind}': { post: operation('Upload cover or banner', ['Anime'], { security: bearer, parameters: [id, { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['cover', 'banner'] } }], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } } } }) },
    '/anime/{animeId}/episodes': {
      get: operation('List episodes', ['Episodes'], { parameters: [animeId] }),
      post: operation('Create episode', ['Episodes'], { security: bearer, parameters: [animeId], requestBody: body({ type: 'object', required: ['number', 'title'], properties: { number: { type: 'integer', minimum: 1 }, title: { type: 'string' }, description: { type: 'string' } } }, { number: 1, title: 'First Light' }), responses: jsonResponse('Episode created', '201') }),
    },
    '/anime/{animeId}/episodes/{episodeId}': {
      patch: operation('Update episode', ['Episodes'], { security: bearer, parameters: [animeId, episodeId], requestBody: body({ type: 'object', properties: { number: { type: 'integer' }, title: { type: 'string' }, description: { type: 'string' } } }, { title: 'First Light – Director cut' }) }),
      delete: operation('Delete episode', ['Episodes'], { security: bearer, parameters: [animeId, episodeId] }),
    },
    '/anime/{animeId}/episodes/{episodeId}/publish': { post: operation('Publish packaged episode', ['Episodes'], { security: bearer, parameters: [animeId, episodeId], requestBody: body({ type: 'object' }, {}) }) },
    '/anime/{animeId}/episodes/{episodeId}/package': { post: operation('Upload prepared episode ZIP package', ['Media'], { security: bearer, parameters: [animeId, episodeId], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['package'], properties: { package: { type: 'string', format: 'binary', description: 'ZIP with manifest.json, metadata.json, master.m3u8, renditions, subtitles, and thumbnail.' } } } } } } }) },
    '/catalog/{resource}': { get: operation('List genres, studios, or tags', ['Catalog'], { parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: ['genres', 'studios', 'tags'] } }] }) },
    '/admin/catalog/{resource}': { post: operation('Create catalog entry', ['Administration'], { security: bearer, parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: ['genres', 'studios', 'tags'] } }], requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, slug: { type: 'string' } } }, { name: 'Adventure', slug: 'adventure' }), responses: jsonResponse('Catalog entry created', '201') }) },
    '/admin/catalog/{resource}/{id}': {
      patch: operation('Update catalog entry', ['Administration'], { security: bearer, parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: ['genres', 'studios', 'tags'] } }, id], requestBody: body({ type: 'object', properties: { name: { type: 'string' }, slug: { type: 'string' } } }, { name: 'Action' }) }),
      delete: operation('Delete catalog entry', ['Administration'], { security: bearer, parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: ['genres', 'studios', 'tags'] } }, id] }),
    },
    '/admin/logs': { get: operation('View persisted audit, security, and system logs', ['Administration'], { security: bearer, parameters: [...page, { name: 'category', in: 'query', schema: { type: 'string', enum: ['audit', 'security', 'system'] } }, { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }] }) },
    '/admin/users/{id}/role': { patch: operation('Change a user role', ['Administration'], { security: bearer, parameters: [id], requestBody: body({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['user', 'dubber', 'admin'] } } }, { role: 'dubber' }) }) },
    '/admin/anime/{animeId}/access': {
      get: operation('List users granted access to a restricted title', ['Administration'], { security: bearer, parameters: [animeId] }),
      post: operation('Grant a user access to a restricted title', ['Administration'], { security: bearer, parameters: [animeId], requestBody: body({ type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' }, expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Optional expiry; omit or null for a permanent grant.' } } }, { userId: '242a6f31-22db-4c37-9eee-4bf643af34f8', expiresAt: null }), responses: jsonResponse('Access granted', '201') }),
    },
    '/admin/anime/{animeId}/access/{userId}': { delete: operation('Revoke a user access grant', ['Administration'], { security: bearer, parameters: [animeId, { ...id, name: 'userId' }] }) },
    '/admin/anime/{animeId}/visibility': { patch: operation('Set title visibility', ['Administration'], { security: bearer, parameters: [animeId], requestBody: body({ type: 'object', required: ['visibility'], properties: { visibility: { type: 'string', enum: ['public', 'restricted'] } } }, { visibility: 'restricted' }) }) },
    '/media/{episodeId}/playback': { post: operation('Authorize playback and issue a short-lived playback token', ['Media'], { security: bearer, parameters: [episodeId], requestBody: body({ type: 'object' }, {}), responses: { ...jsonResponse('Playback authorized'), '403': { description: 'No access to this title', content: { 'application/json': { schema: failure } } }, '404': { description: 'Episode media not found', content: { 'application/json': { schema: failure } } } } }) },
    '/media/play/{token}': { get: operation('Stream a media object using a playback token', ['Media'], { description: 'The opaque playback token is the sole credential; no bearer auth is used. Playlists are returned with child URIs rewritten to tokenized URLs.', parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' }, description: 'Playback token from POST /media/{episodeId}/playback.' }, { name: 'file', in: 'query', required: false, schema: { type: 'string', default: 'master.m3u8' }, example: 'master.m3u8' }], responses: { '200': { description: 'Media stream', content: { 'application/vnd.apple.mpegurl': { schema: { type: 'string', format: 'binary' } } } }, '401': { description: 'Playback link expired', content: { 'application/json': { schema: failure } } }, '404': { description: 'Media not found', content: { 'application/json': { schema: failure } } } } }) },
  },
} as const;
