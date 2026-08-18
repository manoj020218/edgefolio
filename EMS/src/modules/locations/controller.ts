import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { resolveEmployeeActor } from '../../lib/actor-scope';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getEmployeeScope } from '../../lib/scope';
import { companyLatestLocations, employeeRoute, ingestLocations, latestEmployeeLocation } from './service';

export const ingestLocationsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await ingestLocations(resolveEmployeeActor(req, req.body.employeeId, req.body.deviceId), req.body.points));
});

export const latestEmployeeLocationController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await latestEmployeeLocation(getCompanyScope(req)!, getEmployeeScope(req, takeString(req.params.employeeId))!));
});

export const employeeRouteController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await employeeRoute(getCompanyScope(req)!, getEmployeeScope(req, takeString(req.params.employeeId))!, takeString(req.query.start)!, takeString(req.query.end)!, Number(req.query.limit), Number(req.query.page)));
});

export const companyLatestLocationsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await companyLatestLocations(getCompanyScope(req)!));
});
