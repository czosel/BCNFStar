import IRequestBodyINDViolatingRows from "../../definitions/IRequestBodyINDViolatingRows";
import { isIRequestBodyINDViolatingRows } from "../../definitions/IRequestBodyINDViolatingRows.guard";
import { Request, Response } from "express";
import { sqlUtils } from "../../db";

export default async function getViolatingRows(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!isIRequestBodyINDViolatingRows(req.body)) {
      res.status(422).json({ errrors: "Invalid request body" });
      return;
    }

    const body: IRequestBodyINDViolatingRows =
      req.body as IRequestBodyINDViolatingRows;

    const result = await sqlUtils.getViolatingRowsForSuggestedIND(
      body.relationship.referencing,
      body.relationship.referenced,
      body.relationship.columnRelationships,
      body.offset,
      body.limit
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    if (!res.headersSent)
      res.status(502).json({
        error: "Could not get violating rows for functional dependency... ",
      });
  }
}
