import type { Context, Next } from 'hono';
import { ATCError } from '@atc/core';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof ATCError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.statusCode as 400 | 403 | 404 | 409,
      );
    }

    console.error('Unhandled error:', error);
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred',
        },
      },
      500,
    );
  }
}
