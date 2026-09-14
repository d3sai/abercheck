import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentManager, Roles } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { type Manager, ManagerRole } from '../generated/prisma/client';
import { ManagersService } from '../managers/managers.service';
import { CabinetErrors } from './cabinet.errors';
import { type ManagerView, toManagerView } from './cabinet.views';
import { UpdateManagerDto } from './dto/cabinet-body.dto';

@Controller('cabinet/managers')
@UseGuards(SessionGuard)
@Roles(ManagerRole.ADMIN)
export class CabinetManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Get()
  async list(): Promise<ManagerView[]> {
    return (await this.managers.list()).map(toManagerView);
  }

  @Patch(':id')
  async update(
    @CurrentManager() me: Manager,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManagerDto,
  ): Promise<ManagerView> {
    if (id === me.id) {
      throw CabinetErrors.cannotChangeSelf();
    }
    const manager = await this.managers.updateAccess(id, dto);
    if (!manager) {
      throw CabinetErrors.managerNotFound();
    }
    return toManagerView(manager);
  }

  @Post(':id/reset-credentials')
  @HttpCode(HttpStatus.OK)
  async resetCredentials(@Param('id', ParseIntPipe) id: number): Promise<ManagerView> {
    const manager = await this.managers.resetCredentials(id);
    if (!manager) {
      throw CabinetErrors.managerNotFound();
    }
    return toManagerView(manager);
  }
}
