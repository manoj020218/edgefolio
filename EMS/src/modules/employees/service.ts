import { AppError, assertFound } from '../../lib/errors';
import { User } from '../users/model';
import { Employee } from './model';

export async function createEmployee(input: {
  userId: string;
  companyId: string;
  employeeCode: string;
  designation: string;
  department: string;
  managerId?: string;
  joiningDate: string;
  status: 'active' | 'inactive';
}) {
  const user = await User.findById(input.userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (String(user.companyId) !== input.companyId) {
    throw new AppError(400, 'USER_COMPANY_MISMATCH', 'User belongs to a different company');
  }
  const exists = await Employee.exists({ userId: input.userId });
  if (exists) throw new AppError(409, 'EMPLOYEE_EXISTS', 'Employee profile already exists');
  return Employee.create(input);
}

export async function listEmployees(companyId: string, employeeId?: string) {
  return Employee.find(employeeId ? { _id: employeeId, companyId } : { companyId }).sort({ createdAt: -1 }).lean();
}

export async function getEmployee(companyId: string, id: string) {
  return assertFound(await Employee.findOne({ _id: id, companyId }).lean(), 'EMPLOYEE_NOT_FOUND', 'Employee not found');
}

export async function updateEmployee(companyId: string, id: string, updates: Record<string, unknown>) {
  const employee = await Employee.findOneAndUpdate({ _id: id, companyId }, updates, { new: true });
  return assertFound(employee, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
}
