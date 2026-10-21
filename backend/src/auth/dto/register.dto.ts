import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
    MaxLength,
  } from 'class-validator';
  
  export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    fullName: string;
  
    @IsEmail()
    email: string;
  
    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;
  }