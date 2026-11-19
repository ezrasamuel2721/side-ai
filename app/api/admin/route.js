import { get, put } from "@vercel/blob";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = "side-ai/sidaamu-items.json";

function unauthorized() {
  return Response.json(
    {
      error: "Unauthorized owner access"
    },
    {
      status: 401
    }
  );
}

function validAdmin(request) {
  const configured =
    process.env.SIDE_ADMIN_KEY || "";

  const supplied =
    request.headers.get(
      "x-admin-password"
    ) || "";

  if (!configured || !supplied) {
    return false;
  }

  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

async function readItems() {
  try {
    const result = await get(
      DATA_PATH,
      {
        access: "private",
        useCache: false
      }
    );

    if (!result) {
      return [];
    }

    const text =
      await new Response(
        result.stream
      ).text();

    const data = JSON.parse(text);

    return Array.isArray(data)
      ? data
      : [];
  } catch {
    return [];
  }
}

async function writeItems(items) {
  await put(
    DATA_PATH,
    JSON.stringify(
      items,
      null,
      2
    ),
    {
      access: "private",
      allowOverwrite: true,
      contentType:
        "application/json"
    }
  );
}

function cleanText(
  value,
  max = 4000
) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

export async function GET(request) {
  if (!validAdmin(request)) {
    return unauthorized();
  }

  try {
    const items =
      await readItems();

    return Response.json({
      items
    });
  } catch (error) {
    console.error(
      "Admin GET error:",
      error
    );

    return Response.json(
      {
        error:
          "Database unavailable"
      },
      {
        status: 500
      }
    );
  }
}

export async function POST(request) {
  if (!validAdmin(request)) {
    return unauthorized();
  }

  try {
    const body =
      await request.json();

    const type =
      body?.type === "sentence"
        ? "sentence"
        : "word";

    const sidaamu =
      cleanText(
        body?.sidaamu
      );

    const amharic =
      cleanText(
        body?.amharic
      );

    const english =
      cleanText(
        body?.english
      );

    if (
      !sidaamu ||
      (!amharic && !english)
    ) {
      return Response.json(
        {
          error:
            "Sidaamu Afoo and at least one translation are required."
        },
        {
          status: 400
        }
      );
    }

    const item = {
      id: crypto.randomUUID(),

      type,

      sidaamu,

      amharic,

      english,

      verified:
        body?.verified === true,

      createdAt:
        new Date().toISOString()
    };

    const items =
      await readItems();

    items.unshift(item);

    await writeItems(items);

    return Response.json(
      {
        item
      },
      {
        status: 201
      }
    );
  } catch (error) {
    console.error(
      "Admin POST error:",
      error
    );

    return Response.json(
      {
        error:
          "Could not save record."
      },
      {
        status: 500
      }
    );
  }
}

export async function DELETE(
  request
) {
  if (!validAdmin(request)) {
    return unauthorized();
  }

  try {
    const id =
      new URL(
        request.url
      ).searchParams.get(
        "id"
      );

    if (!id) {
      return Response.json(
        {
          error:
            "id is required"
        },
        {
          status: 400
        }
      );
    }

    const items =
      await readItems();

    const next =
      items.filter(
        (item) =>
          item.id !== id
      );

    if (
      next.length ===
      items.length
    ) {
      return Response.json(
        {
          error:
            "Record not found"
        },
        {
          status: 404
        }
      );
    }

    await writeItems(next);

    return Response.json({
      ok: true
    });
  } catch (error) {
    console.error(
      "Admin DELETE error:",
      error
    );

    return Response.json(
      {
        error:
          "Could not delete record."
      },
      {
        status: 500
      }
    );
  }
}
