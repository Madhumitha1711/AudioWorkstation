import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Emails are matched case-insensitively at the storage layer (always
  // lower-cased on write) so "Foo@Bar.com" and "foo@bar.com" are treated as
  // the same account for both the duplicate-email check and login.
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  create(partial: Partial<User>): Promise<User> {
    const user = this.usersRepository.create({
      ...partial,
      email: partial.email?.toLowerCase().trim(),
    });
    return this.usersRepository.save(user);
  }

  save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }
}
