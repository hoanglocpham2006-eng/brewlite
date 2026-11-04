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
- Đặt hàng với 3 phương thức: `COD`, `EWALLET`, `BANK_CARD`.
- Thanh toán điện tử **mô phỏng** (có tùy chọn giả lập thanh toán thất bại), chống gửi trùng bằng `idempotencyKey`.
- Tích điểm khách hàng sau khi thanh toán thành công (10.000đ = 1 điểm).
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
│   localStorage)    │                └────────────────────┘              └──────────────────┘
└────────────────────┘
```

- **Frontend** gọi backend qua biến `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:3001`). Token đăng nhập lưu trong `localStorage` với khóa `access_token`, thông tin người dùng với khóa `user`.
- **Backend** chia theo module: `auth`, `products`, `cart`, `orders`, `payments`, `inventory`, `prisma`. Dữ liệu đầu vào được kiểm tra bằng `ValidationPipe` (`whitelist` và `forbidNonWhitelisted` bật).
- **Database** gồm các nhóm bảng: người dùng và giỏ hàng (`users`, `carts`, `cart_items`), sản phẩm (`products`), đơn hàng (`orders`, `order_items`, `payments`), khuyến mãi và điểm thưởng (`promotion_codes`, `loyalty_transactions`), tồn kho nguyên liệu (`ingredients`, `product_recipes`, `topping_recipes`, `order_ingredient_reservations`).

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
│   │   ├── payments/         # Thanh toán mô phỏng, idempotency, tích điểm
│   │   └── prisma/           # PrismaService
│   ├── test/                 # Test e2e
│   ├── Dockerfile
│   └── prisma.config.ts
├── frontend/                 # Giao diện Next.js
│   ├── src/app/
│   │   ├── page.tsx          # Trang chủ, danh sách món
│   │   ├── products/[id]/    # Chi tiết món
│   │   ├── cart/             # Giỏ hàng
│   │   ├── checkout/         # Đặt hàng và thanh toán
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
| POST | `/orders` | Tạo đơn từ giỏ hàng | Không |
| GET | `/orders/me` | Lịch sử đơn của người dùng đăng nhập | **Có** (`Authorization: Bearer <token>`) |
| POST | `/payments` | Thanh toán đơn bằng `EWALLET` hoặc `BANK_CARD` | Không |

Ví dụ đăng nhập:

```powershell
curl -X POST http://localhost:3001/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"ban@example.com","password":"matkhau123"}'
```

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

Ví dụ thanh toán:

```json
{
  "orderId": 1,
  "paymentMethod": "EWALLET",
  "simulateFailure": false,
  "idempotencyKey": "chuoi-duy-nhat-cho-moi-lan-thanh-toan"
}
```

**Bảng giá cộng thêm:**

| Size | Cộng thêm | Topping | Giá |
| --- | --- | --- | --- |
| S | 0đ | Trân châu | 7.000đ |
| M | 5.000đ | Pudding | 8.000đ |
| L | 10.000đ | Kem cheese | 10.000đ |

Đơn giá một ly = giá món + phụ phí size + tổng giá topping.

## 11. Quy trình đặt hàng và thanh toán

1. Người dùng thêm món vào giỏ (size, topping, số lượng).
2. `POST /orders` chạy trong **một transaction**: kiểm tra giỏ, tính giá, áp mã khuyến mãi, cộng dồn nhu cầu nguyên liệu của cả đơn, **giữ nguyên liệu** (`RESERVED`) bằng khóa lạc quan (cột `version`) rồi tạo đơn ở trạng thái `PENDING`. Nếu bất kỳ bước nào lỗi, toàn bộ được hoàn tác.
3. Với `COD`, giỏ hàng bị xóa ngay. Với thanh toán điện tử, giỏ được giữ đến khi thanh toán thành công.
4. `POST /payments` (chỉ cho đơn `PENDING` hoặc `PAYMENT_FAILED`):
   - Thành công: đơn chuyển `PAID`, nguyên liệu chuyển `CONSUMED`, cộng điểm thưởng.
   - Thất bại (`simulateFailure: true`): đơn chuyển `PAYMENT_FAILED`, nguyên liệu được nhả lại (`RELEASED`). Có thể thanh toán lại, hệ thống sẽ giữ nguyên liệu lần nữa.
   - Gửi lại cùng `idempotencyKey` với cùng nội dung sẽ trả kết quả cũ, không xử lý hai lần.

**Máy trạng thái đơn hàng:**

```
PENDING ──► PAID ──► PREPARING ──► READY ──► COMPLETED
   │          │
   │          └────► CANCELLED
   ├──► PAYMENT_FAILED ──► PENDING (thử lại)
   │          └──────────► CANCELLED
   └──► CANCELLED
```

Các bước `PREPARING`, `READY`, `COMPLETED` đã được định nghĩa trong `order-state-machine.ts` nhưng chưa có API để chuyển trạng thái.

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

## 13. Hạn chế đã biết

- Phần lớn API (giỏ hàng, tạo đơn, thanh toán) nhận `userId` từ request mà **chưa kiểm tra JWT**; chỉ `GET /orders/me` được bảo vệ. Cần thêm `JwtAuthGuard` trước khi triển khai thật.
- Thanh toán là **mô phỏng**, chưa tích hợp cổng thanh toán thực.
- Chưa có giao diện hoặc API quản trị (cập nhật trạng thái đơn, quản lý sản phẩm, nhập kho nguyên liệu).
- Chưa có migration đầy đủ và script seed (xem mục 8).
- Giá size và topping đang được khai báo cố định trong mã nguồn backend.
- `JWT_EXPIRES_IN` trong `docker-compose.yml` chưa được dùng; thời hạn token cố định `1d` trong `auth.module.ts`.
- `.gitignore` ở thư mục gốc đang trống. Hãy thêm `.env*`, `node_modules`, `.next`, `dist` và `backups/` trước khi đưa dự án lên Git.