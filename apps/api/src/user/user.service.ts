import { Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  type PublicUser,
  publicUserColumns,
  usersTable,
} from '#/user/user.schema'

/** Profile fields the signed-in owner may change on their own account. */
export type ProfileChanges = Partial<Pick<PublicUser, 'name' | 'theme'>>

/**
 * The owner's own account. Accounts are created only through
 * `POST /api/auth/register` (single-owner lock), and the email and password
 * only change through the auth flows, so this service never touches them.
 */
@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findOne(id: string): Promise<PublicUser> {
    const [user] = await this.db.db
      .select(publicUserColumns)
      .from(usersTable)
      .where(eq(usersTable.id, id))

    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async update(id: string, changes: ProfileChanges): Promise<PublicUser> {
    const { name, theme } = changes
    if (name === undefined && theme === undefined) return this.findOne(id)

    const [user] = await this.db.db
      .update(usersTable)
      .set({ name, theme })
      .where(eq(usersTable.id, id))
      .returning(publicUserColumns)

    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async remove(id: string): Promise<void> {
    const [user] = await this.db.db
      .delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id })

    if (!user) throw new NotFoundException('User not found')
  }
}
