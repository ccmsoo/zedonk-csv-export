// app/routes/api.order.$id.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server"; 

// OPTIONS 요청 처리 (CORS)
export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
};

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;
    console.log("API called with order ID:", orderId);

    if (!orderId) {
      return json({ error: "Order ID is required" }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 인증 없이 직접 GraphQL 클라이언트 생성
    const { admin, session } = await authenticate.admin(request);

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
    console.log("GraphQL response received");
    
    const order = responseData?.data?.order;
    
    if (!order) {
      console.error("Order not found");
      return json({ error: "Order not found" }, { 
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // Zedonk CSV 형식으로 데이터 변환
    const csvRows = [];
    
    // 헤더 추가
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

    // 주문 데이터로 행 생성
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

    // CSV 문자열로 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // BOM 추가 (Excel UTF-8 지원)
    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    console.log("CSV generated successfully");

    // CSV 파일로 응답 - CORS 헤더 포함
    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    
    return new Response(JSON.stringify({ 
      error: "Internal server error", 
      details: error.message 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};