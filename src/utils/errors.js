export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos invalidos') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'AUTH_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Prohibido') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'No encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicto') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Demasiadas peticiones') {
    super(message, 429, 'RATE_LIMIT');
  }
}

export function errorHandler(error, request, reply) {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      code: error.code
    });
  }

  if (error.validation) {
    return reply.code(400).send({
      error: 'Datos invalidos',
      code: 'VALIDATION_ERROR',
      details: error.validation
    });
  }

  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: 'Demasiadas peticiones',
      code: 'RATE_LIMIT'
    });
  }

  console.error('Error no manejado:', error.message);

  return reply.code(500).send({
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR'
  });
}