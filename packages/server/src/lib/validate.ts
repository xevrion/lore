import {zValidator} from "@hono/zod-validator"
import type {ValidationTargets} from "hono"
import {HTTPException} from "hono/http-exception"
import type {ZodType} from "zod"

// zod's default failure response is a raw issue dump. Every error in this API is
// `{error: string}`, so turn the first issue into a sentence and throw.
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      const path = issue?.path.map(String).join(".")
      const message = issue
        ? path
          ? `${path}: ${issue.message}`
          : issue.message
        : "Invalid input"
      throw new HTTPException(400, {message})
    }
  })
