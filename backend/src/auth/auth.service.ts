
import {
    Injectable,
    ConflictException,
    UnauthorizedException,
  } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import * as bcrypt from 'bcrypt';
  import { PrismaService } from '../prisma/prisma.service';
  import { RegisterDto } from './dto/register.dto';
  import { LoginDto } from './dto/login.dto';
  
  @Injectable()
  export class AuthService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly jwtService: JwtService,
    ) {}
  
    async register(dto: RegisterDto) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
  
      if (existingUser) {
        throw new ConflictException('Email đã được đăng ký.');
      }
  
      const passwordHash = await bcrypt.hash(dto.password, 10);
  
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          phone: dto.phone,
        },
      });
  
      return {
        message: 'Đăng ký thành công.',
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      };
    }
  
    async login(dto: LoginDto) {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
  
      if (!user) {
        throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
      }
  
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );
  
      if (!isPasswordValid) {
        throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
      }
  
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
  
      return {
        message: 'Đăng nhập thành công.',
        access_token: await this.jwtService.signAsync(payload),
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      };
    }
  }
  