// app/routes/api.order.$id.jsx
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    console.log("Processing order:", orderId);

    // 인증 없이 GraphQL 클라이언트 생성
    const { admin } = await unauthenticated.admin("cpnmmm-wb.myshopify.com");

    // GraphQL 쿼리로 주문 데이터 가져오기
    const response = await admin.graphql(
      `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          name
          email
          customer {
            firstName
            lastName
            email
          }
          lineItems(first: 100) {
            edges {
              node {
                title
                quantity
                variant {
                  sku
                  barcode
                  product {
                    title
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          id: `gid://shopify/Order/${orderId}`,
        },
      }
    );

    const responseData = await response.json();
    const order = responseData?.data?.order;
    
    if (!order) {
      return json({ error: "Order not found" }, { status: 404 });
    }

    // CSV 생성 (기존 코드와 동일)
    const csvRows = [];
    
    csvRows.push([
      "Order Reference",
      "Customer Name",
      "Account Code",
      "Style",
      "Fabric",
      "Colour",
      "Size",
      "Barcode",
      "Sales Order Quantity"
    ]);

    order.lineItems.edges.forEach(({ node: item }) => {
      const customerName = order.customer 
        ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
        : 'Guest';
      
      let size = '';
      let colour = '';
      
      if (item.variant?.selectedOptions) {
        item.variant.selectedOptions.forEach(option => {
          const optionName = option.name.toLowerCase();
          if (optionName === 'size') {
            size = option.value;
          } else if (optionName === 'color' || optionName === 'colour') {
            colour = option.value;
          }
        });
      }

      const style = item.variant?.sku || item.title || '';

      csvRows.push([
        order.name,
        customerName,
        '',
        style,
        '',
        colour,
        size,
        item.variant?.barcode || '',
        item.quantity.toString()
      ]);
    });

    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // BOM 추가
    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};