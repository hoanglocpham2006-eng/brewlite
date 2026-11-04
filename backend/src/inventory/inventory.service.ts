import {
    BadRequestException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  
  import { PrismaService } from '../prisma/prisma.service';
  
  interface IngredientUsage {
    id: number;
    name: string;
    unit: string;
    stock: number;
    requiredPerCup: number;
  }
  
  @Injectable()
  export class InventoryService {
    constructor(private readonly prisma: PrismaService) {}
  
    async getAvailability(
      productId: number,
      size: string = 'M',
      toppings: string[] = [],
    ) {
      const normalizedSize = size.trim().toUpperCase();
  
      if (!['S', 'M', 'L'].includes(normalizedSize)) {
        throw new BadRequestException(
          'Size phải là S, M hoặc L',
        );
      }
  
      // 1. Kiểm tra sản phẩm.
      const product = await this.prisma.products.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          is_available: true,
        },
      });
  
      if (!product) {
        throw new NotFoundException('Không tìm thấy sản phẩm');
      }
  
      // 2. Lấy công thức của sản phẩm theo size.
      const recipes = await this.prisma.productRecipe.findMany({
        where: {
          product_id: productId,
          size: normalizedSize,
        },
        include: {
          ingredient: true,
        },
      });
  
      if (recipes.length === 0) {
        throw new NotFoundException(
          `Chưa có công thức cho ${product.name}, size ${normalizedSize}`,
        );
      }
  
      // 3. Lấy công thức topping.
      const allToppingRecipes =
        await this.prisma.toppingRecipe.findMany({
          include: {
            ingredient: true,
          },
        });
  
      const normalize = (value: string) =>
        value.trim().toLocaleLowerCase('vi-VN');
  
      const requestedToppings = [
        ...new Set(
          toppings
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
  
      const knownToppings = new Set(
        allToppingRecipes.map((recipe) =>
          normalize(recipe.topping_name),
        ),
      );
  
      const unknownToppings = requestedToppings.filter(
        (name) => !knownToppings.has(normalize(name)),
      );
  
      if (unknownToppings.length > 0) {
        throw new BadRequestException(
          `Topping không hợp lệ: ${unknownToppings.join(', ')}`,
        );
      }
  
      const normalizedToppings = new Set(
        requestedToppings.map(normalize),
      );
  
      const selectedToppingRecipes =
        allToppingRecipes.filter((recipe) =>
          normalizedToppings.has(
            normalize(recipe.topping_name),
          ),
        );
  
      // 4. Gộp nguyên liệu chung.
      // Ví dụ: sữa tươi dùng trong công thức chính và topping
      // phải được tính chung, không được tính thành hai kho riêng.
      const usage = new Map<number, IngredientUsage>();
  
      const addUsage = (recipe: {
        ingredient_id: number;
        quantity: { toNumber(): number };
        ingredient: {
          id: number;
          name: string;
          unit: string;
          stock: { toNumber(): number };
        };
      }) => {
        const quantity = recipe.quantity.toNumber();
  
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(
            `Định lượng nguyên liệu không hợp lệ: ${recipe.ingredient.name}`,
          );
        }
  
        const current = usage.get(recipe.ingredient_id) ?? {
          id: recipe.ingredient.id,
          name: recipe.ingredient.name,
          unit: recipe.ingredient.unit,
          stock: recipe.ingredient.stock.toNumber(),
          requiredPerCup: 0,
        };
  
        current.requiredPerCup += quantity;
  
        usage.set(recipe.ingredient_id, current);
      };
  
      for (const recipe of recipes) {
        addUsage(recipe);
      }
  
      for (const recipe of selectedToppingRecipes) {
        addUsage(recipe);
      }
  
      // 5. Tính số ly tối đa theo từng nguyên liệu.
      const ingredientDetails = Array.from(usage.values()).map(
        (ingredient) => {
          const maxCups = Math.max(
            0,
            Math.floor(
              ingredient.stock / ingredient.requiredPerCup,
            ),
          );
  
          return {
            ingredient: ingredient.name,
            unit: ingredient.unit,
            stock: ingredient.stock,
            requiredPerCup: ingredient.requiredPerCup,
            maxCups,
          };
        },
      );
  
      const maxCups = Math.min(
        ...ingredientDetails.map((item) => item.maxCups),
      );
  
      const limitingIngredients = ingredientDetails
        .filter((item) => item.maxCups === maxCups)
        .map((item) => item.ingredient);
  
      return {
        productId: product.id,
        productName: product.name,
        size: normalizedSize,
        toppings: requestedToppings,
        maxCups: product.is_available ? maxCups : 0,
        canOrder: product.is_available && maxCups > 0,
        limitingIngredients,
        ingredients: ingredientDetails,
      };
    }
  }