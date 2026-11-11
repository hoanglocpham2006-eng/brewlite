# BrewLite

Ứng dụng web đặt đồ uống (cà phê, trà sữa, matcha, chocolate…) có giỏ hàng, mã khuyến mãi, tích điểm và **cổng thanh toán mô phỏng** (ví BrewPay + thẻ ngân hàng có OTP). Hệ thống trừ tồn kho **theo nguyên liệu** thay vì theo số lượng món, nên mỗi món phải có công thức riêng cho từng size.

> Toàn bộ giao dịch tiền là mô phỏng. Không có tiền thật, không kết nối cổng thanh toán thật.

## Mục lục

- [1. Chức năng](#1-chức-năng)
- [2. Công nghệ](#2-công-nghệ)
- [3. Kiến trúc](#3-kiến-trúc)
- [4. Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
- [5. Chạy bằng Docker Compose](#5-chạy-bằng-docker-compose)
- [6. Chạy trực tiếp trên máy](#6-chạy-trực-tiếp-trên-máy)
- [7. Cơ sở dữ liệu](#7-cơ-sở-dữ-liệu)
- [8. API](#8-api)
- [9. Luồng đặt hàng và thanh toán](#9-luồng-đặt-hàng-và-thanh-toán)
- [10. Kiểm thử và lint](#10-kiểm-thử-và-lint)
- [11. Khắc phục sự cố](#11-khắc-phục-sự-cố)
- [12. Hạn chế đã biết và lưu ý bảo mật](#12-hạn-chế-đã-biết-và-lưu-ý-bảo-mật)

---

## 1. Chức năng

**Tài khoản**
- Đăng ký / đăng nhập bằng email + mật khẩu (bcrypt), xác thực JWT hạn 1 ngày.
- Token lưu trong `sessionStorage` (khóa `access_token`), thông tin người dùng ở khóa `user`. Đóng tab là phải đăng nhập lại.

**Mua hàng**
- Danh sách món, trang chi tiết, chọn size `S`/`M`/`L` và topping (`Trân châu`, `Pudding`, `Kem cheese`).
- Giá luôn được backend tính lại; không tin giá từ client.
- Giỏ hàng lưu trong database theo người dùng.
- Kiểm tra số ly tối đa có thể đặt dựa trên tồn kho nguyên liệu.
- Mã khuyến mãi: giảm theo `%` hoặc số tiền cố định, có đơn tối thiểu và thời hạn.

**Thanh toán**
- Ba phương thức: `COD` (khi nhận hàng), `EWALLET` (ví BrewPay), `BANK_CARD` (thẻ ngân hàng).
- Phiên thanh toán có thời hạn 5 phút, mã giao dịch dạng `BLP...`.
- Ví BrewPay: kích hoạt bằng PIN 6 số, nạp tiền thử nghiệm, trừ tiền có điều kiện, khóa ví 5 phút khi nhập sai PIN 3 lần.
- Thẻ: kiểm tra Luhn, định dạng, hạn thẻ, CVV; thẻ 3-D Secure yêu cầu OTP 6 số (hiệu lực 3 phút, hiển thị mô phỏng như SMS).
- Thử lại khi thất bại, hủy thanh toán, hoàn tiền khi hủy đơn đã thanh toán.
- Tích điểm sau khi thanh toán thành công (10.000đ = 1 điểm), thu hồi điểm khi hủy đơn.
- Tác vụ nền mỗi 30 giây đóng các phiên thanh toán quá hạn.

## 2. Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 12.0, TypeScript, `class-validator`, Passport JWT, bcrypt |
| ORM | Prisma 6.19 |
| Cơ sở dữ liệu | PostgreSQL 18 |
| Đóng gói | Docker, Docker Compose (image `node:24-alpine`) |
| Kiểm thử / lint | Jest, oxlint (backend), ESLint (frontend) |

## 3. Kiến trúc

```
┌────────────────────┐   HTTP/JSON    ┌────────────────────┐   Prisma   ┌────────────────────┐
│ Frontend           │ ─────────────► │ Backend            │ ─────────► │ PostgreSQL         │
│ Next.js  :3000     │ ◄───────────── │ NestJS   :3001     │ ◄───────── │ :5432 (host 5433)  │
│ token: sessionStorage              │ JWT + ValidationPipe          │                    │
└────────────────────┘                └────────────────────┘            └────────────────────┘
```

- Frontend gọi API qua `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:3001`). Biến này được **nhúng lúc build**.
- Backend cố định cổng `3001` và CORS cho `http://localhost:3000` trong `backend/src/main.ts`; biến `PORT` trong `.env.example` chưa được dùng.
- `ValidationPipe` bật `whitelist` và `forbidNonWhitelisted`: gửi field lạ sẽ bị **400** (ví dụ gửi `pin` vào `/wallet/topup`).
- Module backend: `auth`, `products`, `cart`, `inventory`, `orders`, `payments` (kèm `wallet` bên trong), `prisma`.

## 4. Cấu trúc thư mục

```
brewlite/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Toàn bộ mô hình dữ liệu
│   │   └── migrations/            # Hiện chỉ có 1 migration tạo bảng users
│   ├── prisma.config.ts           # Prisma đọc DATABASE_URL từ .env
│   ├── src/
│   │   ├── auth/                  # register, login, JwtAuthGuard
│   │   ├── products/              # GET /products
│   │   ├── cart/                  # Giỏ hàng
│   │   ├── inventory/             # Số ly tối đa theo tồn kho
│   │   ├── orders/                # Tạo đơn, lịch sử, hủy, máy trạng thái
│   │   │   └── order-state-machine.ts
│   │   ├── payments/
│   │   │   ├── payments.service.ts     # Phiên thanh toán, chuyển trạng thái, hoàn tiền
│   │   │   ├── payments.controller.ts  # /payments/*
│   │   │   ├── wallet.service.ts       # Ví BrewPay
│   │   │   ├── wallet.controller.ts    # /wallet/*
│   │   │   ├── card-gateway.ts         # Luhn, hạn thẻ, bộ thẻ thử nghiệm
│   │   │   ├── otp.ts                  # OTP mô phỏng
│   │   │   └── payment.constants.ts    # Hạn mức, thời hạn, số lần thử
│   │   ├── prisma/                # PrismaService
│   │   └── main.ts                # CORS, ValidationPipe, cổng 3001
│   ├── test/                      # e2e mặc định của Nest
│   └── Dockerfile
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx               # Trang chủ, danh sách món
│   │   ├── products/[id]/         # Chi tiết món
│   │   ├── cart/                  # Giỏ hàng
│   │   ├── checkout/              # Thông tin nhận hàng → tạo đơn
│   │   ├── pay/[orderId]/         # Thanh toán: ví, thẻ, OTP, kết quả
│   │   ├── orders/                # Lịch sử đơn
│   │   ├── login/, register/
│   │   └── components/SiteHeader.tsx
│   ├── public/images/products/    # 8 ảnh sản phẩm
│   └── Dockerfile
├── backups/                       # Dump cũ, KHÔNG dùng để khởi tạo DB (xem 7.4)
├── postman/                       # Collection Postman
├── docker-compose.yml
├── .env.docker                    # Biến cho Docker (chứa mật khẩu — xem mục 12)
└── .env.example                   # Mẫu biến khi chạy trực tiếp
```

## 5. Chạy bằng Docker Compose

### 5.1. Yêu cầu
- Docker Desktop (Compose v2), Git.

### 5.2. Chuẩn bị `.env.docker`

Tạo `.env.docker` ở **thư mục gốc** (cạnh `docker-compose.yml`):

```env
POSTGRES_USER=brewlite
POSTGRES_PASSWORD=doi_thanh_mat_khau_cua_ban
POSTGRES_DB=brewlite_db
JWT_SECRET=doi_thanh_chuoi_ngau_nhien_dai
JWT_EXPIRES_IN=1d
```

Tạo `JWT_SECRET` ngẫu nhiên:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.3. Build và khởi động

```powershell
docker compose --env-file .env.docker up -d --build
```

> **Bắt buộc có `--env-file .env.docker`.** `docker-compose.yml` dùng `${POSTGRES_USER}`, `${POSTGRES_PASSWORD}`, `${POSTGRES_DB}`, `${JWT_SECRET}` để nội suy, mà Compose chỉ tự đọc file tên `.env` (không phải `.env.docker`). Thiếu cờ này, các biến thành chuỗi rỗng và backend liên tục restart với lỗi `PrismaClientInitializationError: User was denied access on the database`.

| Dịch vụ | Container | Cổng trên máy |
| --- | --- | --- |
| PostgreSQL 18 | `brewlite-db` | `5433` → `5432` |
| Backend NestJS | `brewlite-backend` | `3001` |
| Frontend Next.js | `brewlite-frontend` | `3000` |

Backend chờ database qua healthcheck (`pg_isready`) rồi mới khởi động. Dữ liệu nằm trong volume `brewlite_brewlite_postgres_data` — `docker compose down` **không** xoá dữ liệu.

### 5.4. Tạo bảng (lần đầu hoặc sau khi sửa schema)

Container backend không tự chạy migration:

```powershell
docker compose --env-file .env.docker exec backend npx prisma db push
```

Nếu Prisma cảnh báo mất dữ liệu (ví dụ thêm unique constraint trên bảng đang có dữ liệu trùng), chỉ dùng cờ xác nhận sau khi đã kiểm tra:

```powershell
docker compose --env-file .env.docker exec backend npx prisma db push --accept-data-loss
```

### 5.5. Nạp dữ liệu tối thiểu

`db push` chỉ tạo **bảng rỗng**. Muốn đặt hàng được phải có sản phẩm, nguyên liệu và công thức — xem [mục 7.2](#72-dữ-liệu-tối-thiểu-để-đặt-hàng).

### 5.6. Lệnh thường dùng

```powershell
docker compose --env-file .env.docker ps                  # trạng thái
docker compose --env-file .env.docker logs -f backend     # log backend
docker compose --env-file .env.docker up -d --build       # build lại tất cả
docker compose --env-file .env.docker up -d --build backend
docker compose --env-file .env.docker exec db psql -U brewlite -d brewlite_db
docker compose --env-file .env.docker down                # dừng, giữ dữ liệu
docker compose --env-file .env.docker down -v             # dừng, XOÁ volume dữ liệu
```

Sao lưu database:

```powershell
docker compose --env-file .env.docker exec db pg_dump -U brewlite -Fc brewlite_db -f /tmp/brewlite_db.backup
docker cp brewlite-db:/tmp/brewlite_db.backup ./backups/brewlite_db.backup
```

Mở <http://localhost:3000>.

> Đổi `NEXT_PUBLIC_API_URL` (tham số `args` trong `docker-compose.yml`) thì phải build lại frontend, vì giá trị được nhúng vào bundle.

## 6. Chạy trực tiếp trên máy

Yêu cầu: Node.js **24+**, npm, PostgreSQL 18 (hoặc chỉ chạy container DB: `docker compose --env-file .env.docker up -d db`, khi đó dùng cổng `5433`).

### 6.1. Backend

Tạo `backend/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/brewlite_db?schema=public
JWT_SECRET=doi_thanh_chuoi_ngau_nhien_dai
```

```powershell
cd backend
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

Backend ở <http://localhost:3001>; khi kết nối DB thành công, log in ra `Da ket noi PostgreSQL thanh cong!`.

### 6.2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend ở <http://localhost:3000>. Nếu API không phải `http://localhost:3001`, tạo `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 7. Cơ sở dữ liệu

### 7.1. Bảng

| Nhóm | Bảng |
| --- | --- |
| Người dùng, giỏ hàng | `users`, `carts`, `cart_items` |
| Sản phẩm | `products` |
| Đơn hàng, thanh toán | `orders`, `order_items`, `payments` |
| Khuyến mãi, điểm thưởng | `promotion_codes`, `loyalty_transactions` |
| Tồn kho nguyên liệu | `ingredients`, `product_recipes`, `topping_recipes`, `order_ingredient_reservations` |
| Ví mô phỏng | `sim_wallets`, `wallet_transactions` |

Thư mục `backend/prisma/migrations` chỉ có migration tạo bảng `users`; các bảng còn lại chỉ tồn tại trong `schema.prisma`. Vì vậy luôn dùng `prisma db push` (không dùng `migrate deploy`).

### 7.2. Dữ liệu tối thiểu để đặt hàng

| Bảng | Vai trò |
| --- | --- |
| `products` | Món đang bán (`name`, `price`, `image_url`, `category`, `is_available`) |
| `ingredients` | Nguyên liệu + tồn kho (`name`, `unit`, `stock`) |
| `product_recipes` | Công thức **theo từng size** `S`, `M`, `L` (`product_id`, `ingredient_id`, `size`, `quantity`) |
| `topping_recipes` | Nguyên liệu cho `Trân châu`, `Pudding`, `Kem cheese` |
| `promotion_codes` | Tùy chọn; `discount_type` = `PERCENTAGE` hoặc `FIXED` |

Thiếu công thức, `POST /orders` trả **400** với message dạng `Chưa có công thức cho "Bạc xỉu", size S.` — đây là lỗi **thiếu dữ liệu**, không phải thiếu bảng. Kiểm tra nhanh:

```sql
select count(*) from products;
select count(*) from ingredients;
select p.name, pr.size, count(*) from products p
join product_recipes pr on pr.product_id = p.id
group by 1, 2 order by 1, 2;
```

Ảnh món nằm ở `frontend/public/images/products/` (`cafe-den.jpg`, `cafe-sua.jpg`, `bac-xiu.jpg`, `latte.jpg`, `tra-sua-tran-chau.jpg`, `tra-dao.jpg`, `matcha-latte.jpg`, `chocolate-da-xay.jpg`); `image_url` nên là `/images/products/<file>.jpg`.

### 7.3. Nạp dữ liệu mẫu

Repo **chưa có script seed**. Có thể nạp tay bằng SQL:

```sql
-- Sản phẩm
INSERT INTO products (name, description, price, image_url, category) VALUES
  ('Cà phê đen', 'Cà phê đen đậm vị', 20000, '/images/products/cafe-den.jpg', 'Cà phê');

-- Nguyên liệu
INSERT INTO ingredients (name, unit, stock) VALUES
  ('Cà phê rang xay', 'g', 5000),
  ('Trân châu', 'g', 3000);

-- Công thức theo size: S = 15g, M = 20g, L = 25g
INSERT INTO product_recipes (product_id, ingredient_id, size, quantity)
SELECT p.id, i.id, s.size, s.qty
FROM products p, ingredients i,
     (VALUES ('S', 15), ('M', 20), ('L', 25)) AS s(size, qty)
WHERE p.name = 'Cà phê đen' AND i.name = 'Cà phê rang xay';

-- Topping: 30g trân châu mỗi ly
INSERT INTO topping_recipes (topping_name, ingredient_id, quantity)
SELECT 'Trân châu', id, 30 FROM ingredients WHERE name = 'Trân châu';

-- Mã khuyến mãi: giảm 10% cho đơn từ 50.000đ
INSERT INTO promotion_codes (code, discount_type, discount_value, minimum_order_amount)
VALUES ('GIAM10', 'PERCENTAGE', 10, 50000);
```

```powershell
docker cp seed.sql brewlite-db:/tmp/seed.sql
docker compose --env-file .env.docker exec db psql -U brewlite -d brewlite_db -f /tmp/seed.sql
```

Lưu ý: mỗi món cần công thức cho **cả 3 size** mà người dùng có thể chọn, nếu không sẽ gặp lỗi 400 ở size còn thiếu.

### 7.4. Thư mục `backups/`

`backups/brewlite_db.backup` là dump custom của PostgreSQL từ giai đoạn đầu dự án, **chỉ có 7 bảng** (`users`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `_prisma_migrations`) và thiếu nguyên liệu, công thức, khuyến mãi, thanh toán, ví. Không dùng để khởi tạo DB cho phiên bản hiện tại; file có thể chứa dữ liệu cá nhân.

## 8. API

Gốc: `http://localhost:3001`. Các route có JWT cần header `Authorization: Bearer <access_token>` và chỉ thao tác trên dữ liệu của chính người dùng.

| Method | Đường dẫn | Mô tả | JWT |
| --- | --- | --- | --- |
| POST | `/auth/register` | `fullName`, `email`, `password` (8–72 ký tự), `phone` (tùy chọn) | Không |
| POST | `/auth/login` | Trả `access_token` (hạn 1 ngày) | Không |
| GET | `/products` | Danh sách món đang bán | Không |
| GET | `/inventory/products/:productId/availability?size=M&toppings=Pudding,Trân châu` | Số ly tối đa đặt được | Không |
| GET | `/cart/:userId` | Xem giỏ | Không |
| POST | `/cart/items` | `userId`, `productId`, `size`, `toppings[]` | Không |
| PATCH | `/cart/items/:id` | `userId`, `quantity` | Không |
| DELETE | `/cart/items/:id?userId=` | Xoá món khỏi giỏ | Không |
| POST | `/orders` | Tạo đơn từ giỏ (trạng thái `PENDING`) | Không |
| GET | `/orders/me` | Lịch sử đơn của tôi | **Có** |
| POST | `/orders/:id/cancel` | Hủy đơn `PENDING`/`PAYMENT_FAILED`/`PAID` (đơn đã trả tiền sẽ được hoàn) | **Có** |
| GET | `/wallet` | `{ exists, balance, lockedUntil, transactions }` | **Có** |
| POST | `/wallet` | Kích hoạt ví: `{ "pin": "123456" }`, số dư 0 | **Có** |
| POST | `/wallet/topup` | `{ "amount": 50000 }` — 10.000đ … 2.000.000đ/lần, tối đa 10.000.000đ | **Có** |
| GET | `/payments/test-cards` | 7 thẻ thử nghiệm | **Có** |
| POST | `/payments` | Mở phiên cho đơn `PENDING`/`PAYMENT_FAILED`: `{ orderId, idempotencyKey, paymentMethod? }` | **Có** |
| GET | `/payments/:id` | Xem phiên (tự đóng nếu quá hạn) | **Có** |
| POST | `/payments/:id/confirm` | Ví: `{ "pin" }`. Thẻ: `{ cardNumber, cardHolder, expiry, cvv }` | **Có** |
| POST | `/payments/:id/otp` | `{ "otp": "123456" }` cho thẻ 3-D Secure | **Có** |
| POST | `/payments/:id/cancel` | Khách hủy thanh toán | **Có** |

**Quy ước lỗi của bước xác nhận:**

- Lỗi sửa được (sai PIN, sai OTP, số thẻ sai Luhn, CVV sai…) → **400** kèm `code` và `attemptsLeft`; phiên vẫn mở.
- Giao dịch đã kết thúc (bị từ chối, không đủ tiền, quá số lần thử, hết hạn) → **200** với `status` `FAILED`/`EXPIRED`/`CANCELLED` và `failure.code`, `failure.message`.
- Field không có trong DTO → **400** (`property X should not exist`) vì `forbidNonWhitelisted`.

Ví dụ tạo đơn:

```json
{
  "userId": 1,
  "recipientName": "Nguyễn Văn A",
  "recipientPhone": "0901234567",
  "deliveryAddress": "123 Nguyễn Trãi, Quận 1",
  "note": "Ít đá",
  "paymentMethod": "EWALLET",
  "promotionCode": "GIAM10"
}
```

Ví dụ mở phiên thanh toán:

```json
{ "orderId": 1, "idempotencyKey": "chuoi-duy-nhat-cho-moi-lan-thanh-toan" }
```

Gửi lại cùng `idempotencyKey` trả về đúng phiên cũ; dùng khóa này cho đơn khác sẽ bị từ chối.

**Bảng giá cộng thêm** (khai báo trong `orders.service.ts` và `cart.service.ts`):

| Size | Phụ phí | Topping | Giá |
| --- | --- | --- | --- |
| S | 0đ | Trân châu | 7.000đ |
| M | 5.000đ | Pudding | 8.000đ |
| L | 10.000đ | Kem cheese | 10.000đ |

Đơn giá một ly = giá món + phụ phí size + tổng topping.

## 9. Luồng đặt hàng và thanh toán

### 9.1. Máy trạng thái đơn

Mọi thay đổi trạng thái đi qua `assertTransition` trong `orders/order-state-machine.ts` và cập nhật có điều kiện, nên không thể nhảy cóc hay ghi đè khi có yêu cầu song song.

```
PENDING ──► PAID ──► PREPARING ──► READY ──► COMPLETED
   │          │
   │          └────► CANCELLED
   ├──► PAYMENT_FAILED ──► PENDING (thử lại)
   │          └──────────► CANCELLED
   └──► CANCELLED
```

| Sự kiện | Trạng thái |
| --- | --- |
| Tạo đơn (giữ nguyên liệu) | `PENDING` |
| Mở phiên cho đơn `PAYMENT_FAILED` | `PAYMENT_FAILED` → `PENDING` |
| Thanh toán thành công | `PENDING` → `PAID` |
| Thất bại (thẻ bị từ chối, thiếu số dư, sai quá 3 lần, hết hạn, khách hủy) | `PENDING` → `PAYMENT_FAILED`, hoàn nguyên liệu |
| Hủy đơn chưa thanh toán | `PENDING`/`PAYMENT_FAILED` → `CANCELLED` |
| Hủy đơn đã thanh toán | `PAID` → `CANCELLED`, hoàn tiền + hoàn nguyên liệu + thu hồi điểm |

`PREPARING`, `READY`, `COMPLETED` đã có trong máy trạng thái nhưng chưa có API chuyển.

### 9.2. Một giao dịch gồm các bước

1. **Đặt hàng** — `POST /orders` chạy trong transaction: kiểm tra giỏ, tính giá, áp mã, **giữ nguyên liệu** bằng khóa lạc quan (cột `version`), tạo đơn `PENDING`. `COD` xoá giỏ ngay; thanh toán trực tuyến giữ giỏ và frontend chuyển sang `/pay/<orderId>`.
2. **Mở phiên** — `POST /payments` tạo phiên `AWAITING_PAYMENT`, mã `BLP...`, hạn 5 phút.
3. **Xác nhận** — `POST /payments/:id/confirm`:
   - Ví: kiểm tra PIN, trừ tiền có điều kiện (chỉ trừ khi đủ số dư), ghi `wallet_transactions`.
   - Thẻ: kiểm tra Luhn/định dạng/hạn thẻ, rồi quyết định theo bộ thẻ thử nghiệm.
4. **OTP** — thẻ 3-D Secure chuyển phiên sang `AWAITING_OTP`; OTP 6 số hạn 3 phút, hiển thị trên giao diện.
5. **Kết thúc** — phiên `SUCCESS`/`FAILED`/`EXPIRED`/`CANCELLED`. Thất bại thì giữ giỏ, hoàn nguyên liệu; khách thử lại hoặc hủy đơn.
6. **Hoàn tiền** — hủy đơn `PAID` cộng lại tiền vào ví (hoặc ghi nhận hoàn về thẻ), phiên chuyển `REFUNDED`.

### 9.3. Quy tắc cổng mô phỏng

| Quy tắc | Giá trị |
| --- | --- |
| Hạn phiên thanh toán | 5 phút |
| Hạn OTP | 3 phút |
| Số lần nhập sai mỗi bước | 3 |
| Sai PIN 3 lần | Giao dịch thất bại, ví khóa 5 phút |
| Số dư ví tối đa | 10.000.000đ |
| Nạp mỗi lần | 10.000đ – 2.000.000đ |
| Dữ liệu thẻ lưu lại | Chỉ thương hiệu + 4 số cuối (không lưu số đầy đủ, không lưu CVV) |

**Thẻ thử nghiệm** (hạn thẻ bất kỳ trong tương lai, ví dụ `12/30`; tên chủ thẻ và CVV 3 số bất kỳ):

| Số thẻ | Kết quả |
| --- | --- |
| `4242 4242 4242 4242` | Thành công ngay |
| `5555 5555 5555 4444` | Thành công sau OTP |
| `9704 0000 0000 0018` | Thành công sau OTP |
| `4000 0000 0000 0002` | Bị từ chối (`CARD_DECLINED`) |
| `4000 0000 0000 9995` | Không đủ số dư (`INSUFFICIENT_FUNDS`) |
| `4000 0000 0000 0069` | Thẻ hết hạn (`EXPIRED_CARD`) |
| `4000 0000 0000 0127` | Thẻ bị khóa (`CARD_BLOCKED`) |

Số hợp lệ Luhn nhưng không có trong danh sách → `UNKNOWN_CARD` (được nhập lại, tính vào 3 lần thử). Trang thanh toán có mục **Thẻ thử nghiệm** để điền nhanh.

Thử nhanh bằng ví: kích hoạt ví → nạp tiền → nhập PIN để trả. Muốn thấy thất bại do thiếu tiền thì đừng nạp đủ; muốn thấy khóa ví thì nhập sai PIN 3 lần.

## 10. Kiểm thử và lint

```powershell
cd backend
npm run lint        # oxlint
npm test            # jest
npm run test:e2e    # jest + test/app.e2e-spec.ts
npm run build       # nest build

cd ../frontend
npm run lint        # eslint
npm run build       # next build
```

**Thực trạng `npm test` hiện tại:** 13 test suite, chỉ `src/orders/order-state-machine.spec.ts` chạy được (9 test pass). 12 suite còn lại **không load được** vì Jest đang chạy CommonJS trong khi `@nestjs/testing` là ESM:

```
Must use import to load ES Module: ...\node_modules\@nestjs\testing\index.js
```

Cần cấu hình Jest cho ESM (hoặc chuyển sang `ts-jest`/`vitest` với `type: module`) trước khi coi bộ test này là hàng rào kiểm chứng. `test/app.e2e-spec.ts` vẫn là mẫu mặc định của Nest (`GET /` → `Hello World!`) và cần PostgreSQL đang chạy.

Backend: thư mục `payments/` **không có** unit test; `card-gateway.ts` và `payments.service.ts` hiện chỉ được kiểm chứng thủ công qua API và trình duyệt.

## 11. Khắc phục sự cố

| Hiện tượng | Nguyên nhân / cách sửa |
| --- | --- |
| `POST /payments` trả 401 `Vui lòng đăng nhập để tiếp tục.` | Request không gửi header `Authorization`. Từ bản hiện tại, trang `/checkout` không gọi `/payments` nữa mà chuyển sang `/pay/<orderId>`, nơi có gắn token. Nếu vẫn 401, kiểm tra `sessionStorage.access_token` và đăng nhập lại. |
| Backend restart liên tục, log `P1010 / User was denied access on the database` | Chạy compose thiếu `--env-file .env.docker` nên `${POSTGRES_USER}`… rỗng. |
| `POST /orders` trả 400 `Chưa có công thức cho "X", size S.` | Thiếu dòng trong `product_recipes`/`topping_recipes` — xem [7.2](#72-dữ-liệu-tối-thiểu-để-đặt-hàng). |
| `db push` báo `There might be data loss` | Thêm unique constraint/cột mới. Kiểm tra dữ liệu trùng rồi chạy với `--accept-data-loss`. |
| Không bind được cổng `3000/3001/5433` | Đã có process hoặc stack Docker khác dùng cổng đó. Tắt bên kia hoặc đổi host port trong `docker-compose.yml`. |
| Sửa code nhưng container không đổi | Image chỉ build lại khi có `--build`: `docker compose --env-file .env.docker up -d --build`. |
| Đổi `NEXT_PUBLIC_API_URL` không có tác dụng | Biến được nhúng lúc build — phải build lại frontend. |

## 12. Hạn chế đã biết và lưu ý bảo mật

**Hạn chế chức năng**
- `GET /cart/:userId` và `POST /orders` vẫn nhận `userId` từ body/URL mà **chưa kiểm tra JWT**; người dùng có thể thao tác trên giỏ/đơn của người khác nếu biết id. Các API thanh toán, ví, hủy đơn, `/orders/me` đã bắt buộc JWT và kiểm tra chủ sở hữu.
- Thanh toán mô phỏng: không có cổng thật, OTP hiển thị trên màn hình thay vì gửi SMS, hoàn tiền về thẻ chỉ ghi nhận trong dữ liệu.
- Đơn thanh toán trực tuyến không được mở phiên và cũng không hủy sẽ giữ nguyên liệu cho đến khi khách thanh toán/hủy.
- Hủy đơn đã thanh toán sẽ xoá dòng điểm của đơn đó (cột `order_id` của `loyalty_transactions` là unique nên không ghi được điểm âm).
- Chưa có API/giao diện quản trị: không có cách đưa đơn qua `PREPARING`/`READY`/`COMPLETED`, không có API quản lý sản phẩm hay nhập kho.
- Chưa có script seed; `backend/prisma/migrations` chỉ có migration `users`.
- Giá size và topping hard-code trong backend; cổng `3001` và CORS `http://localhost:3000` cố định trong `main.ts`; `JWT_EXPIRES_IN` trong compose chưa dùng (token luôn 1 ngày).
- Bộ test backend hiện không chạy được (xem mục 10).

**Bảo mật**
- `.env.docker` chứa mật khẩu DB và `JWT_SECRET`, hiện **đang được Git theo dõi**, và `.gitignore` ở thư mục gốc đang rỗng. Nên bỏ khỏi index và thêm vào ignore:

  ```powershell
  git rm --cached .env.docker
  Add-Content .gitignore ".env`n.env.*`n!.env.example`n"
  ```

  Nếu file đã từng được push, hãy coi mật khẩu và `JWT_SECRET` trong đó là đã lộ và đổi lại.
- Token JWT nằm trong `sessionStorage` nên dễ bị đọc nếu có XSS; không có cơ chế refresh token hay thu hồi token.
- API không có rate limit; số lần thử PIN/OTP chỉ được giới hạn theo từng phiên thanh toán.
