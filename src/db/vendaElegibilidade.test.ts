import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { validarElegibilidadeVenda } from "./vendaElegibilidade";

test("SQLite: ativo, inativo, reativação, preço zerado/negativo/nulo e isolamento de holding", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE cliente (holding_id INTEGER, cd_cliente INTEGER, id_ativo INTEGER);
    CREATE TABLE produto (holding_id INTEGER, cd_produto INTEGER, vl_venda REAL);
    INSERT INTO cliente VALUES (7, 1, 1), (8, 1, 0), (7, -1, 1);
    INSERT INTO produto VALUES (7, 10, 10), (8, 10, 0), (7, 11, NULL);`);
  const db = {
    getFirstAsync: async (sql: string, params: any[]) =>
      sqlite.prepare(sql).get(...params) ?? null,
  } as any;
  try {
    await validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 10 }]);
    await validarElegibilidadeVenda(db, 7, -1, [{ cdProduto: 10 }]);
    await assert.rejects(
      validarElegibilidadeVenda(db, 8, 1, [{ cdProduto: 10 }]),
      /Cliente inativo/,
    );
    await assert.rejects(
      validarElegibilidadeVenda(db, 7, 99, [{ cdProduto: 10 }]),
      /Cliente inativo/,
    );
    sqlite.exec(
      "UPDATE cliente SET id_ativo = 0 WHERE holding_id = 7 AND cd_cliente = 1",
    );
    await assert.rejects(
      validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 10 }]),
      /Cliente inativo/,
    );
    sqlite.exec(
      "UPDATE cliente SET id_ativo = 1 WHERE holding_id = 7 AND cd_cliente = 1",
    );
    await validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 10 }]);
    for (const price of [0, -5, null]) {
      sqlite
        .prepare(
          "UPDATE produto SET vl_venda = ? WHERE holding_id = 7 AND cd_produto = 10",
        )
        .run(price);
      await assert.rejects(
        validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 10 }]),
        /sem preço de venda válido/,
      );
    }
    await assert.rejects(
      validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 11 }]),
      /sem preço/,
    );
    await assert.rejects(
      validarElegibilidadeVenda(db, 7, 1, [{ cdProduto: 99 }]),
      /sem preço/,
    );
  } finally {
    sqlite.close();
  }
});
