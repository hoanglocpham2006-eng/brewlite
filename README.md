# BrewLite

Ứng dụng web đặt đồ uống (cà phê, trà sữa, matcha, chocolate…) không dùng tiền mặt. Khách hàng đăng ký tài khoản, chọn món theo size và topping, thêm vào giỏ, áp mã khuyến mãi, đặt hàng và thanh toán (mô phỏng). Hệ thống tự trừ tồn kho **theo nguyên liệu** thay vì theo số lượng món.

## Mục lục

- [BrewLite](#brewlite)
  - [Mục lục](#mục-lục)
  - [1. Chức năng](#1-chức-năng)
  - [2. Công nghệ sử dụng](#2-công-nghệ-sử-dụng)
  - [3. Kiến trúc](#3-kiến-trúc)
  - [4. Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
  - [5. Yêu cầu cài đặt](#5-yêu-cầu-cài-đặt)
  - [6. Chạy bằng Docker Compose (khuyến nghị)](#6-chạy-bằng-docker-compose-khuyến-nghị)
    - [Bước 1. Tạo file `.env.docker`](#bước-1-tạo-file-envdocker)
    - [Bước 2. Build và khởi động](#bước-2-build-và-khởi-động)
    - [Bước 3. Tạo bảng trong database](#bước-3-tạo-bảng-trong-database)
    - [Bước 4. Sử dụng](#bước-4-sử-dụng)
  - [7. Chạy trực tiếp trên Windows (không dùng Docker cho ứng dụng)](#7-chạy-trực-tiếp-trên-windows-không-dùng-docker-cho-ứng-dụng)
    - [Bước 1. Chuẩn bị PostgreSQL](#bước-1-chuẩn-bị-postgresql)
    - [Bước 2. Cấu hình và chạy backend](#bước-2-cấu-hình-và-chạy-backend)
    - [Bước 3. Chạy frontend](#bước-3-chạy-frontend)
    - [Bước 4. Nạp dữ liệu mẫu](#bước-4-nạp-dữ-liệu-mẫu)
  - [8. Cơ sở dữ liệu và dữ liệu mẫu](#8-cơ-sở-dữ-liệu-và-dữ-liệu-mẫu)
    - [8.1. Tạo cấu trúc bảng](#81-tạo-cấu-trúc-bảng)
    - [8.2. Dữ liệu cần có để đặt hàng](#82-dữ-liệu-cần-có-để-đặt-hàng)
    - [8.3. Ví dụ nạp dữ liệu](#83-ví-dụ-nạp-dữ-liệu)
    - [8.4. Thư mục `backups/`](#84-thư-mục-backups)
  - [9. Cập nhật database và build lại container](#9-cập-nhật-database-và-build-lại-container)
  - [10. Các API chính](#10-các-api-chính)
  - [11. Quy trình đặt hàng và thanh toán](#11-quy-trình-đặt-hàng-và-thanh-toán)
    - [11.1. Máy trạng thái đơn hàng](#111-máy-trạng-thái-đơn-hàng)
    - [11.2. Các bước của một giao dịch](#112-các-bước-của-một-giao-dịch)
    - [11.3. Quy tắc của cổng thanh toán mô phỏng](#113-quy-tắc-của-cổng-thanh-toán-mô-phỏng)
  - [12. Kiểm thử](#12-kiểm-thử)
  - [13. Hạn chế đã biết](#13-hạn-chế-đã-biết)

---

## 1. Chức năng

- Đăng ký, đăng nhập bằng email và mật khẩu (mật khẩu băm bằng bcrypt, xác thực bằng JWT, hạn 1 ngày).
- Xem danh sách đồ uống và trang chi tiết từng món.
- Chọn **size** (S, M, L) và **topping** (Trân châu, Pudding, Kem cheese). Giá được backend tính lại, không tin giá từ frontend.
- Giỏ hàng lưu trong database theo từng người dùng.
- Kiểm tra số ly tối đa có thể đặt dựa trên tồn kho nguyên liệu.
- Mã khuyến mãi (giảm theo phần trăm hoặc số tiền cố định, có đơn tối thiểu và thời hạn).
- Đặt hàng với 3 phương thức: `COD`, `EWALLET` (ví BrewPay), `BANK_CARD` (thẻ ngân hàng).
- **Cổng thanh toán mô phỏng (BrewPay Sandbox)** với đầy đủ các bước như giao dịch thật: phiên thanh toán có thời hạn, ví có số dư và mã PIN, thẻ có kiểm tra Luhn, hạn thẻ, CVV và xác thực OTP (3-D Secure), giới hạn số lần nhập sai, hoàn tiền khi hủy đơn. Không có tiền thật nào được chuyển.
- Mọi bước thanh toán đều đi theo đúng máy trạng thái đơn hàng ở [mục 11](#11-quy-trình-đặt-hàng-và-thanh-toán).
- Tích điểm khách hàng sau khi thanh toán thành công (10.000đ = 1 điểm), thu hồi điểm nếu đơn bị hủy và hoàn tiền.
- Hủy đơn (khi chưa vào khâu pha chế), tự hoàn tiền và hoàn nguyên liệu nếu đơn đã thanh toán.
- Xem lịch sử đơn hàng của chính mình.

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 12, TypeScript, class-validator, Passport/JWT, bcrypt |
| ORM | Prisma 6 |
| Cơ sở dữ liệu | PostgreSQL 18 |
| Đóng gói | Docker, Docker Compose (Node 24 Alpine) |
| Kiểm thử, lint | Jest, oxlint, ESLint, Prettier |

## 3. Kiến trúc

```
┌────────────────────┐   HTTP/JSON    ┌────────────────────┐    Prisma    ┌──────────────────┐
│  Frontend          │ ─────────────► │  Backend           │ ───────────► │  PostgreSQL      │
│  Next.js :3000     │ ◄───────────── │  NestJS :3001      │ ◄─────────── │  :5432 (host 5433│
│  (token trong      │                │  JWT + Validation  │              │   khi dùng Docker)│
│   sessionStorage)  │                └────────────────────┘              └──────────────────┘
└────────────────────┘
```

- **Frontend** gọi backend qua biến `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:3001`). Token đăng nhập lưu trong `sessionStorage` với khóa `access_token`, thông tin người dùng với khóa `user` (đóng tab là phải đăng nhập lại).
- **Backend** chia theo module: `auth`, `products`, `cart`, `orders`, `payments`, `inventory`, `wallet` (nằm trong module payments), `prisma`. Dữ liệu đầu vào được kiểm tra bằng `ValidationPipe` (`whitelist` và `forbidNonWhitelisted` bật).
- **Database** gồm các nhóm bảng: người dùng và giỏ hàng (`users`, `carts`, `cart_items`), sản phẩm (`products`), đơn hàng (`orders`, `order_items`, `payments`), khuyến mãi và điểm thưởng (`promotion_codes`, `loyalty_transactions`), tồn kho nguyên liệu (`ingredients`, `product_recipes`, `topping_recipes`, `order_ingredient_reservations`), ví mô phỏng (`sim_wallets`, `wallet_transactions`).

## 4. Cấu trúc thư mục

```
brewlite/
├── backend/                  # API NestJS
│   ├── prisma/
│   │   ├── schema.prisma     # Mô hình dữ liệu
│   │   └── migrations/       # Migration (hiện chỉ có bảng users)
│   ├── src/
│   │   ├── auth/             # Đăng ký, đăng nhập, JWT guard
│   │   ├── products/         # Danh sách sản phẩm
│   │   ├── cart/             # Giỏ hàng
│   │   ├── inventory/        # Kiểm tra số ly tối đa theo nguyên liệu
│   │   ├── orders/           # Tạo đơn, lịch sử đơn, máy trạng thái đơn
│   │   ├── payments/         # Cổng thanh toán mô phỏng
│   │   │   ├── payments.service.ts   # Phiên thanh toán, chuyển trạng thái đơn, hủy và hoàn tiền
│   │   │   ├── wallet.service.ts     # Ví BrewPay: kích hoạt, nạp tiền
│   │   │   ├── card-gateway.ts       # Luhn, hạn thẻ, bộ thẻ thử nghiệm
│   │   │   ├── otp.ts                # OTP mô phỏng
│   │   │   └── payment.constants.ts  # Thời hạn phiên, số lần thử, hạn mức
│   │   ├── testing/          # Database giả trong bộ nhớ dùng cho test
│   │   └── prisma/           # PrismaService
│   ├── test/                 # Test e2e
│   ├── Dockerfile
│   └── prisma.config.ts
├── frontend/                 # Giao diện Next.js
│   ├── src/app/
│   │   ├── page.tsx          # Trang chủ, danh sách món
│   │   ├── components/       # SiteHeader: thanh điều hướng theo trạng thái đăng nhập
│   │   ├── products/[id]/    # Chi tiết món
│   │   ├── cart/             # Giỏ hàng
│   │   ├── checkout/         # Nhập thông tin nhận hàng và đặt hàng
│   │   ├── pay/[orderId]/    # Trang thanh toán: ví, thẻ, OTP, kết quả, thử lại
│   │   ├── orders/           # Lịch sử đơn hàng
│   │   ├── login/            # Đăng nhập
│   │   └── register/         # Đăng ký
│   ├── public/images/products/   # Ảnh sản phẩm (8 file .jpg)
│   └── Dockerfile
├── backups/                  # Bản dump PostgreSQL cũ (xem mục 8)
├── docker-compose.yml        # db + backend + frontend
├── .env.example              # Mẫu biến môi trường khi chạy trực tiếp
└── README.md
```

## 5. Yêu cầu cài đặt

**Chạy bằng Docker (cách nhanh nhất):**

- Docker Desktop (có Docker Compose v2)
- Git

**Chạy trực tiếp trên Windows:**

- Node.js 24 trở lên (bản Docker dùng Node 24) và npm
- PostgreSQL 18 (hoặc dùng container `db` trong `docker-compose.yml`)
- Git

## 6. Chạy bằng Docker Compose (khuyến nghị)

### Bước 1. Tạo file `.env.docker`

File này **không nằm trong mã nguồn** vì chứa mật khẩu. Tạo file `.env.docker` ở thư mục gốc dự án (cùng cấp `docker-compose.yml`) với nội dung:

```env
POSTGRES_USER=brewlite
POSTGRES_PASSWORD=doi_thanh_mat_khau_cua_ban
POSTGRES_DB=brewlite_db
JWT_SECRET=doi_thanh_chuoi_ngau_nhien_dai
JWT_EXPIRES_IN=1d
```

Tạo `JWT_SECRET` ngẫu nhiên bằng Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Tuyệt đối không đưa `.env.docker` lên Git.

### Bước 2. Build và khởi động

```powershell
docker compose up -d --build
```

Compose khởi động 3 dịch vụ:

| Dịch vụ | Container | Cổng trên máy |
| --- | --- | --- |
| PostgreSQL 18 | `brewlite-db` | `5433` |
| Backend (NestJS) | `brewlite-backend` | `3001` |
| Frontend (Next.js) | `brewlite-frontend` | `3000` |

Backend chỉ khởi động sau khi database báo sẵn sàng (healthcheck).

### Bước 3. Tạo bảng trong database

Container backend **không tự tạo bảng**. Chạy một lần sau lần khởi động đầu tiên:

```powershell
docker compose exec backend npx prisma db push
```

Sau đó nạp dữ liệu mẫu theo [mục 8](#8-cơ-sở-dữ-liệu-và-dữ-liệu-mẫu), vì không có sản phẩm và công thức nguyên liệu thì không đặt hàng được.

### Bước 4. Sử dụng

Mở trình duyệt: <http://localhost:3000>

Dừng hệ thống:

```powershell
docker compose down          # giữ lại dữ liệu database
docker compose down -v       # xóa luôn dữ liệu database (volume)
```

## 7. Chạy trực tiếp trên Windows (không dùng Docker cho ứng dụng)

### Bước 1. Chuẩn bị PostgreSQL

Có hai lựa chọn:

- Dùng PostgreSQL cài sẵn trên máy (cổng mặc định `5432`), tạo database `brewlite_db`.
- Hoặc chỉ chạy container database từ Compose: `docker compose up -d db` (cổng `5433`, cần file `.env.docker` như mục 6).

### Bước 2. Cấu hình và chạy backend

Tạo file `backend/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/brewlite_db?schema=public
```

(Nếu dùng container của Compose, đổi `5432` thành `5433`.)

Mở PowerShell:

```powershell
cd backend
npm install
npx prisma generate
npx prisma db push

# NestJS không tự đọc file .env cho JWT_SECRET, nên đặt biến môi trường
# trong chính cửa sổ PowerShell sẽ chạy backend:
$env:JWT_SECRET = "doi_thanh_chuoi_ngau_nhien_dai"
$env:DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/brewlite_db?schema=public"

npm run start:dev
```

Backend chạy tại <http://localhost:3001>. Khi kết nối thành công, console in dòng `Da ket noi PostgreSQL thanh cong!`.

> Cổng `3001` và CORS (`http://localhost:3000`) hiện được cố định trong `backend/src/main.ts`. Biến `PORT` trong `.env.example` chưa được sử dụng.

### Bước 3. Chạy frontend

Mở một cửa sổ PowerShell khác:

```powershell
cd frontend
npm install
npm run dev
```

Frontend chạy tại <http://localhost:3000>. Nếu backend không ở `http://localhost:3001`, tạo `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Bước 4. Nạp dữ liệu mẫu

Xem [mục 8](#8-cơ-sở-dữ-liệu-và-dữ-liệu-mẫu).

## 8. Cơ sở dữ liệu và dữ liệu mẫu

### 8.1. Tạo cấu trúc bảng

Thư mục `backend/prisma/migrations` hiện **chỉ chứa migration tạo bảng `users`**. Các bảng còn lại được định nghĩa trong `schema.prisma` nhưng chưa có migration tương ứng. Vì vậy dùng `prisma db push` để tạo đủ bảng theo schema:

```powershell
# Docker
docker compose exec backend npx prisma db push

# Chạy trực tiếp
cd backend
npx prisma db push
```

### 8.2. Dữ liệu cần có để đặt hàng

Dự án **chưa có script seed**. Để luồng đặt hàng hoạt động, database cần tối thiểu:

| Bảng | Vai trò |
| --- | --- |
| `products` | Danh sách đồ uống (`name`, `price`, `image_url`, `category`, `is_available`) |
| `ingredients` | Nguyên liệu và tồn kho (`name`, `unit`, `stock`) |
| `product_recipes` | Công thức từng món **theo từng size** `S`, `M`, `L` |
| `topping_recipes` | Công thức nguyên liệu của `Trân châu`, `Pudding`, `Kem cheese` |
| `promotion_codes` | Mã khuyến mãi (tùy chọn). `discount_type` là `PERCENTAGE` hoặc `FIXED` |

Thiếu công thức của món hoặc topping thì khi đặt hàng backend trả lỗi dạng `Chưa có công thức cho "...", size M.`

Ảnh sản phẩm nằm trong `frontend/public/images/products/` (`cafe-den.jpg`, `cafe-sua.jpg`, `bac-xiu.jpg`, `latte.jpg`, `tra-sua-tran-chau.jpg`, `tra-dao.jpg`, `matcha-latte.jpg`, `chocolate-da-xay.jpg`). Đặt `image_url` của sản phẩm trỏ tới các file này, ví dụ `/images/products/cafe-den.jpg`.

### 8.3. Ví dụ nạp dữ liệu

Tạo file `seed.sql` (ví dụ dưới đây chỉ minh họa cho một món, hãy nhân rộng cho các món còn lại):

```sql
-- Sản phẩm
INSERT INTO products (name, description, price, image_url, category) VALUES
  ('Cà phê đen', 'Cà phê đen đậm vị', 20000, '/images/products/cafe-den.jpg', 'Cà phê');

-- Nguyên liệu (stock tính theo đơn vị unit)
INSERT INTO ingredients (name, unit, stock) VALUES
  ('Cà phê rang xay', 'g', 5000),
  ('Trân châu', 'g', 3000);

-- Công thức món theo size: S = 15g, M = 20g, L = 25g cà phê
INSERT INTO product_recipes (product_id, ingredient_id, size, quantity)
SELECT p.id, i.id, s.size, s.qty
FROM products p, ingredients i,
     (VALUES ('S', 15), ('M', 20), ('L', 25)) AS s(size, qty)
WHERE p.name = 'Cà phê đen' AND i.name = 'Cà phê rang xay';

-- Công thức topping (mỗi ly dùng 30g trân châu)
INSERT INTO topping_recipes (topping_name, ingredient_id, quantity)
SELECT 'Trân châu', id, 30 FROM ingredients WHERE name = 'Trân châu';

-- Mã khuyến mãi: giảm 10% cho đơn từ 50.000đ
INSERT INTO promotion_codes (code, discount_type, discount_value, minimum_order_amount)
VALUES ('GIAM10', 'PERCENTAGE', 10, 50000);
```

Chạy file bằng Docker:

```powershell
docker cp seed.sql brewlite-db:/tmp/seed.sql
docker compose exec db psql -U brewlite -d brewlite_db -f /tmp/seed.sql
```

(Thay `brewlite` và `brewlite_db` bằng giá trị trong `.env.docker` của bạn.)

### 8.4. Thư mục `backups/`

`backups/brewlite_db.backup` là bản dump định dạng custom của PostgreSQL, tạo từ giai đoạn đầu của dự án. Bản này **chỉ có 7 bảng** (`users`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `_prisma_migrations`) và **thiếu** các bảng nguyên liệu, công thức, khuyến mãi, thanh toán, điểm thưởng. Không nên dùng nó để khởi tạo database cho phiên bản hiện tại. File này có thể chứa dữ liệu cá nhân, đừng đưa lên kho mã công khai.

## 9. Cập nhật database và build lại container

**Sau khi sửa `schema.prisma`:**

```powershell
# Chạy trực tiếp
cd backend
npx prisma db push
npx prisma generate

# Docker: build lại backend rồi đồng bộ schema
docker compose up -d --build backend
docker compose exec backend npx prisma db push
```

**Nâng cấp lên cổng thanh toán mô phỏng (một lần):** bảng `payments` bỏ cột `simulate_failure` và thêm nhiều cột mới, đồng thời có thêm hai bảng `sim_wallets` và `wallet_transactions`. Vì có xóa một cột nên Prisma sẽ cảnh báo mất dữ liệu cột đó, hãy chạy kèm cờ xác nhận:

```powershell
# Chạy trực tiếp
cd backend
npx prisma db push --accept-data-loss
npx prisma generate

# Docker
docker compose up -d --build backend
docker compose exec backend npx prisma db push --accept-data-loss
```

Các giao dịch cũ trong bảng `payments` được giữ lại. Những dòng cũ có trạng thái `PROCESSING` không còn được hệ thống sử dụng.

**Sau khi sửa mã nguồn (Docker):**

```powershell
docker compose up -d --build            # build lại tất cả
docker compose up -d --build backend    # chỉ backend
docker compose up -d --build frontend   # chỉ frontend
```

**Đổi địa chỉ API của frontend:** `NEXT_PUBLIC_API_URL` được nhúng vào frontend **lúc build**, nên sau khi đổi (tham số `args` trong `docker-compose.yml`) phải build lại frontend.

**Xem log và vào database:**

```powershell
docker compose logs -f backend
docker compose exec db psql -U brewlite -d brewlite_db
```

**Sao lưu và khôi phục database:**

```powershell
docker compose exec db pg_dump -U brewlite -Fc brewlite_db -f /tmp/brewlite_db.backup
docker cp brewlite-db:/tmp/brewlite_db.backup ./backups/brewlite_db.backup
```

## 10. Các API chính

Địa chỉ gốc: `http://localhost:3001`

| Phương thức | Đường dẫn | Mô tả | Yêu cầu JWT |
| --- | --- | --- | --- |
| POST | `/auth/register` | Đăng ký (`fullName`, `email`, `password` từ 8 đến 72 ký tự, `phone` tùy chọn) | Không |
| POST | `/auth/login` | Đăng nhập, trả về `access_token` | Không |
| GET | `/products` | Danh sách sản phẩm đang bán | Không |
| GET | `/inventory/products/:productId/availability?size=M&toppings=Pudding,Trân châu` | Số ly tối đa còn đặt được | Không |
| GET | `/cart/:userId` | Xem giỏ hàng | Không |
| POST | `/cart/items` | Thêm món (`userId`, `productId`, `size`, `toppings`) | Không |
| PATCH | `/cart/items/:id` | Đổi số lượng (`userId`, `quantity`) | Không |
| DELETE | `/cart/items/:id?userId=` | Xóa món khỏi giỏ | Không |
| POST | `/orders` | Tạo đơn từ giỏ hàng (trạng thái `PENDING`) | Không |
| GET | `/orders/me` | Lịch sử đơn của người dùng đăng nhập | **Có** |
| POST | `/orders/:id/cancel` | Hủy đơn (`PENDING`, `PAYMENT_FAILED` hoặc `PAID`). Đơn đã thanh toán được hoàn tiền | **Có** |
| GET | `/wallet` | Số dư ví BrewPay và 10 giao dịch gần nhất | **Có** |
| POST | `/wallet` | Kích hoạt ví với mã PIN 6 số (`{ "pin": "123456" }`), số dư ban đầu 0đ | **Có** |
| POST | `/wallet/topup` | Nạp tiền thử nghiệm (`{ "amount": 100000 }`, từ 10.000đ đến 2.000.000đ mỗi lần, số dư tối đa 10.000.000đ) | **Có** |
| GET | `/payments/test-cards` | Danh sách thẻ thử nghiệm | **Có** |
| POST | `/payments` | Tạo phiên thanh toán cho đơn `PENDING` hoặc `PAYMENT_FAILED` | **Có** |
| GET | `/payments/:id` | Xem phiên thanh toán (tự đóng phiên nếu đã hết hạn) | **Có** |
| POST | `/payments/:id/confirm` | Ví: `{ "pin" }`. Thẻ: `{ "cardNumber", "cardHolder", "expiry", "cvv" }` | **Có** |
| POST | `/payments/:id/otp` | Thẻ 3-D Secure: nhập mã OTP (`{ "otp": "123456" }`) | **Có** |
| POST | `/payments/:id/cancel` | Khách hủy thanh toán | **Có** |

Các API có JWT gửi kèm header `Authorization: Bearer <token>` và chỉ thao tác được trên dữ liệu của chính người dùng đó.

**Cách phản hồi lỗi của bước xác nhận:**

- Lỗi nhập liệu có thể sửa được (sai PIN, sai OTP, số thẻ sai Luhn, CVV sai…) trả **HTTP 400** kèm `code` và `attemptsLeft` (số lần thử còn lại). Phiên vẫn mở để khách nhập lại.
- Giao dịch kết thúc (bị từ chối, không đủ số dư, hết số lần thử, hết hạn) trả **HTTP 200** với `status` là `FAILED`, `EXPIRED` hoặc `CANCELLED`, kèm `failure.code` và `failure.message`.

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

Ví dụ tạo phiên thanh toán (`paymentMethod` có thể bỏ qua, mặc định dùng phương thức của đơn):

```json
{
  "orderId": 1,
  "idempotencyKey": "chuoi-duy-nhat-cho-moi-lan-thanh-toan"
}
```

Gửi lại cùng `idempotencyKey` sẽ nhận lại đúng phiên cũ thay vì tạo phiên mới. Khóa dùng cho đơn khác bị từ chối.

**Bảng giá cộng thêm:**

| Size | Cộng thêm | Topping | Giá |
| --- | --- | --- | --- |
| S | 0đ | Trân châu | 7.000đ |
| M | 5.000đ | Pudding | 8.000đ |
| L | 10.000đ | Kem cheese | 10.000đ |

Đơn giá một ly = giá món + phụ phí size + tổng giá topping.

## 11. Quy trình đặt hàng và thanh toán

### 11.1. Máy trạng thái đơn hàng

Mọi thao tác thanh toán, thất bại, thử lại và hủy đều chỉ đi theo các đường dưới đây. Mỗi lần đổi trạng thái đều đi qua `assertTransition` trong `order-state-machine.ts` và được cập nhật có điều kiện (nếu trạng thái vừa bị thay đổi bởi yêu cầu khác thì bị từ chối), nên không thể nhảy cóc.

```
PENDING ──► PAID ──► PREPARING ──► READY ──► COMPLETED
   │          │
   │          └────► CANCELLED
   ├──► PAYMENT_FAILED ──► PENDING (thử lại)
   │          └──────────► CANCELLED
   └──► CANCELLED
```

| Sự kiện | Trạng thái đơn |
| --- | --- |
| Tạo đơn (giữ nguyên liệu) | `PENDING` |
| Tạo phiên thanh toán cho đơn `PAYMENT_FAILED` (thử lại) | `PAYMENT_FAILED` → `PENDING`, giữ lại nguyên liệu |
| Thanh toán thành công (PIN đúng và đủ tiền, thẻ được duyệt, hoặc OTP đúng) | `PENDING` → `PAID` |
| Thất bại: thẻ bị từ chối, không đủ số dư, nhập sai quá 3 lần, OTP hết hạn, phiên hết hạn, khách hủy thanh toán | `PENDING` → `PAYMENT_FAILED`, hoàn nguyên liệu |
| Hủy đơn khi chưa thanh toán | `PENDING` hoặc `PAYMENT_FAILED` → `CANCELLED` |
| Hủy đơn đã thanh toán (chưa pha chế) | `PAID` → `CANCELLED`, hoàn tiền, hoàn nguyên liệu, thu hồi điểm |

Các bước `PREPARING`, `READY`, `COMPLETED` đã được định nghĩa trong máy trạng thái nhưng chưa có API để chuyển.

### 11.2. Các bước của một giao dịch

1. **Đặt hàng:** `POST /orders` chạy trong một transaction: kiểm tra giỏ, tính giá, áp mã khuyến mãi, **giữ nguyên liệu** bằng khóa lạc quan (cột `version`) rồi tạo đơn `PENDING`. Với `COD`, giỏ bị xóa ngay; với thanh toán trực tuyến, giao diện chuyển sang trang `/pay/<mã đơn>` và giỏ được giữ cho đến khi thanh toán thành công.
2. **Mở phiên:** `POST /payments` tạo phiên ở trạng thái `AWAITING_PAYMENT` với mã giao dịch `BLP...` và thời hạn **5 phút**.
3. **Xác nhận** (`POST /payments/:id/confirm`):
   - **Ví BrewPay:** nhập PIN 6 số. Trừ tiền có điều kiện (chỉ trừ khi số dư đủ) và ghi sổ giao dịch ví.
   - **Thẻ:** nhập số thẻ, tên chủ thẻ, hạn thẻ, CVV. Hệ thống kiểm tra Luhn, định dạng, hạn thẻ rồi quyết định theo bộ thẻ thử nghiệm.
4. **OTP (chỉ thẻ 3-D Secure):** phiên chuyển sang `AWAITING_OTP`. Mã OTP 6 số có hiệu lực **3 phút** và được hiển thị trên giao diện như một tin nhắn SMS mô phỏng. Nhập đúng OTP thì đơn mới sang `PAID`.
5. **Kết thúc:** phiên thành `SUCCESS`, `FAILED`, `EXPIRED` hoặc `CANCELLED`. Khi thất bại, giỏ hàng vẫn được giữ, nguyên liệu được hoàn về kho, khách có thể **thử lại** (đơn `PAYMENT_FAILED` → `PENDING`, giữ lại nguyên liệu) hoặc **hủy đơn**.
6. **Hoàn tiền:** hủy đơn đã `PAID` sẽ cộng lại tiền vào ví (hoặc ghi nhận hoàn về thẻ), phiên thanh toán chuyển `REFUNDED`.

Một tác vụ nền chạy mỗi 30 giây để đóng các phiên đã quá hạn, tránh giữ nguyên liệu mãi mãi.

### 11.3. Quy tắc của cổng thanh toán mô phỏng

| Quy tắc | Giá trị |
| --- | --- |
| Thời hạn phiên thanh toán | 5 phút |
| Thời hạn OTP | 3 phút |
| Số lần nhập sai tối đa mỗi bước | 3 |
| Sai PIN ví 3 lần | Giao dịch thất bại, ví bị khóa 5 phút |
| Số dư ví tối đa | 10.000.000đ |
| Số tiền nạp mỗi lần | 10.000đ đến 2.000.000đ |
| Lưu trữ thẻ | Chỉ lưu thương hiệu và 4 số cuối, **không** lưu số thẻ đầy đủ hay CVV |

**Thẻ thử nghiệm** (hạn thẻ nhập bất kỳ ngày nào trong tương lai, ví dụ `12/30`, tên chủ thẻ bất kỳ, CVV 3 số bất kỳ):

| Số thẻ | Kết quả |
| --- | --- |
| `4242 4242 4242 4242` (Visa) | Thành công ngay |
| `5555 5555 5555 4444` (Mastercard) | Thành công sau khi nhập OTP |
| `9704 0000 0000 0018` (thẻ nội địa) | Thành công sau khi nhập OTP |
| `4000 0000 0000 0002` | Bị từ chối (`CARD_DECLINED`) |
| `4000 0000 0000 9995` | Không đủ số dư (`INSUFFICIENT_FUNDS`) |
| `4000 0000 0000 0069` | Thẻ hết hạn (`EXPIRED_CARD`) |
| `4000 0000 0000 0127` | Thẻ bị khóa (`CARD_BLOCKED`) |

Số thẻ hợp lệ Luhn nhưng không nằm trong danh sách trên bị báo `UNKNOWN_CARD` (được nhập lại, tính vào 3 lần thử). Trên trang thanh toán có mục **Thẻ thử nghiệm** để điền nhanh.

**Thử nhanh bằng ví:** kích hoạt ví với một PIN, bấm nút nạp tiền, rồi nhập PIN để thanh toán. Để thử thất bại do thiếu tiền, đừng nạp đủ. Để thử khóa ví, nhập sai PIN 3 lần.

## 12. Kiểm thử

```powershell
cd backend
npm test            # unit test (Jest)
npm run test:cov    # kèm độ phủ
npm run test:e2e    # test e2e
npm run lint        # oxlint

cd ../frontend
npm run lint        # ESLint
```

Phần thanh toán có 47 test trong `backend/src/payments/`:

- `card-gateway.spec.ts`: Luhn, hạn thẻ, thương hiệu, từng thẻ thử nghiệm, OTP.
- `payments.flow.spec.ts`: các luồng thanh toán đầy đủ (ví, thẻ, OTP, hết hạn, thử lại, hủy, hoàn tiền) chạy trên database giả trong bộ nhớ (`src/testing/fake-prisma.ts`). Sau mỗi test, mọi lần đổi trạng thái đơn đều được kiểm tra bằng `assertTransition` và cuối cùng phải phủ đủ 6 cạnh của sơ đồ (`PENDING→PAID`, `PENDING→PAYMENT_FAILED`, `PAYMENT_FAILED→PENDING`, `PENDING→CANCELLED`, `PAYMENT_FAILED→CANCELLED`, `PAID→CANCELLED`).

Cần Node.js **24 trở lên** để chạy Jest với NestJS 12. Database giả không có khóa dòng nên không kiểm tra được trường hợp hai yêu cầu chạy song song, phần đó dựa vào các câu lệnh cập nhật có điều kiện trên PostgreSQL.

## 13. Hạn chế đã biết

- Giỏ hàng và `POST /orders` vẫn nhận `userId` từ request mà **chưa kiểm tra JWT**. Các API thanh toán, ví, hủy đơn và lịch sử đơn đã bắt buộc JWT và kiểm tra chủ sở hữu đơn.
- Thanh toán là **mô phỏng**, chưa tích hợp cổng thanh toán thực. OTP được hiển thị ngay trên giao diện thay vì gửi qua SMS.
- Hoàn tiền về thẻ chỉ được ghi nhận trong dữ liệu giao dịch, không có giao dịch hoàn tiền thật.
- Đơn thanh toán trực tuyến đã tạo nhưng khách không mở phiên thanh toán cũng không hủy vẫn giữ nguyên liệu cho đến khi khách thanh toán hoặc hủy đơn.
- Hủy đơn đã thanh toán sẽ xóa dòng điểm thưởng của đơn đó (cột `order_id` của bảng điểm là duy nhất nên không thể ghi thêm dòng điểm âm).
- Chưa có giao diện hoặc API quản trị (đưa đơn qua `PREPARING`, `READY`, `COMPLETED`, quản lý sản phẩm, nhập kho nguyên liệu).
- Chưa có migration đầy đủ và script seed (xem mục 8).
- Giá size và topping đang được khai báo cố định trong mã nguồn backend.
- `JWT_EXPIRES_IN` trong `docker-compose.yml` chưa được dùng; thời hạn token cố định `1d` trong `auth.module.ts`.
- `.gitignore` ở thư mục gốc đang trống. Hãy thêm `.env*`, `node_modules`, `.next`, `dist` và `backups/` trước khi đưa dự án lên Git.