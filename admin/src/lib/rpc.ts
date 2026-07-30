import { ZodError, type ZodType } from 'zod';
import adminNakama from './nakama';

function formatSchemaError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'RPC response did not match the expected schema';
  const path = issue.path.length > 0 ? issue.path.join('.') : 'response';
  return `Invalid RPC response at ${path}: ${issue.message}`;
}

export async function rpcWithSchema<TSchemaOutput>(
  rpcId: string,
  payload: object | undefined,
  schema: ZodType<TSchemaOutput>,
): Promise<TSchemaOutput> {
  const response = await adminNakama.rpc<unknown>(rpcId, payload);

  try {
    return schema.parse(response);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatSchemaError(error));
    }
    throw error;
  }
}

export default rpcWithSchema;
