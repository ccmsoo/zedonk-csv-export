import { json } from "@remix-run/node";

const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN || "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";
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;
    console.log("API called with order ID:", orderId);

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    
    const graphqlQuery = {
      query: `
        query getOrder($id: ID!) {
          order(id: $id) {
            name
            note
            tags
            customAttributes {
              key
              value
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  quantity
                  variant {
                    sku
                    barcode
                    title
                    selectedOptions {
                      name
                      value
                    }
                    product {
                      title
                      productType
                      vendor
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        id: `gid://shopify/Order/${orderId}`
      }
    };

    console.log("Sending GraphQL request...");
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
      },
      body: JSON.stringify(graphqlQuery),
    });

    const responseData = await response.json();
    console.log("GraphQL response received:", JSON.stringify(responseData, null, 2));
    
    if (responseData.errors) {
      console.error("GraphQL errors:", responseData.errors);
      return json({ error: "GraphQL query failed", details: responseData.errors }, { status: 400 });
    }
    
    const order = responseData?.data?.order;
    
    if (!order) {
      return json({ error: "Order not found" }, { status: 404 });
    }

    // 고객 정보 추출 함수
    const extractCustomerInfo = () => {
      let customerName = '';
      let accountCode = '';
      
      // 1. Custom Attributes에서 찾기
      if (order.customAttributes && order.customAttributes.length > 0) {
        order.customAttributes.forEach(attr => {
          if (attr.key === 'Customer Name' || attr.key === 'customer_name') {
            customerName = attr.value;
          }
          if (attr.key === 'Account Code' || attr.key === 'account_code') {
            accountCode = attr.value;
          }
        });
      }
      
      // 2. Order Note에서 파싱
      if (order.note) {
        console.log("Order note content:", order.note);
        
        // 고객명 추출: "고객명: XXX" 패턴
        if (!customerName) {
          const nameMatch = order.note.match(/고객명:\s*([^\n]+)/);
          if (nameMatch) {
            customerName = nameMatch[1].trim();
          }
        }
        
        // Account Code 추출: "Account Code: XXX" 패턴
        if (!accountCode) {
          const codeMatch = order.note.match(/Account Code:\s*([^\n]+)/);
          if (codeMatch) {
            accountCode = codeMatch[1].trim();
          }
        }
        
        // 대체 패턴들 시도
        if (!customerName) {
          // "Customer: XXX" 패턴
          const altNameMatch = order.note.match(/Customer:\s*([^\n]+)/i);
          if (altNameMatch) {
            customerName = altNameMatch[1].trim();
          }
        }
      }
      
      // 3. Tags에서 찾기
      if (!customerName && order.tags) {
        const tags = order.tags.split(',').map(tag => tag.trim());
        const customerTag = tags.find(tag => tag.toLowerCase().startsWith('customer:'));
        if (customerTag) {
          customerName = customerTag.substring(9).replace(/_/g, ' ').trim();
        }
      }
      
      // N/A 값 처리
      if (customerName === 'N/A') customerName = '';
      if (accountCode === 'N/A') accountCode = '';
      
      console.log("Extracted customer info:", { customerName, accountCode });
      return { customerName, accountCode };
    };

    const { customerName, accountCode } = extractCustomerInfo();

    // CSV 생성
    const csvRows = [];
    
    // Zedonk 형식 헤더
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

    // 주문 라인 아이템 처리
    order.lineItems.edges.forEach(({ node: item }, index) => {
      let size = '';
      let colour = '';
      
      // 옵션에서 Size와 Colour 추출
      if (item.variant?.selectedOptions) {
        item.variant.selectedOptions.forEach(option => {
          const optionName = option.name.toLowerCase();
          if (optionName === 'size' || optionName === '사이즈') {
            size = option.value;
          } else if (optionName === 'color' || optionName === 'colour' || optionName === '색상') {
            colour = option.value;
          }
        });
      }

      // variant title에서 추가 정보 추출 (예: "M / Red")
      if (!size && !colour && item.variant?.title && item.variant.title !== 'Default Title') {
        const parts = item.variant.title.split(' / ');
        if (parts.length >= 1 && !size) size = parts[0].trim();
        if (parts.length >= 2 && !colour) colour = parts[1].trim();
      }

      const style = item.variant?.sku || item.title || '';
      const fabric = item.variant?.product?.productType || item.variant?.product?.vendor || '';

      console.log(`Line item ${index + 1}:`, {
        title: item.title,
        sku: item.variant?.sku,
        size,
        colour,
        quantity: item.quantity
      });

      csvRows.push([
        order.name || '',
        customerName,      // Order Note에서 추출한 고객명
        accountCode,       // Order Note에서 추출한 Account Code
        style,
        fabric,
        colour || '',
        size || '',
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

    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    console.log("CSV generated successfully");
    console.log("First 500 chars of CSV:", finalCsv.substring(0, 500));

    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${order.name.replace('#', '')}.csv"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    console.error("Error stack:", error.stack);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};