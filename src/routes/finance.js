// routes/finance.js
import express from "express";
import { auth, allowRoles } from "../middleware/auth.js";
import Payment from "../models/Payment.js";
import User from "../models/user.js";

const router = express.Router();

// 📌 Helper: Calculate subscription year
const calculateSubscriptionYear = (registrationDate) => {
  const regDate = new Date(registrationDate);
  const currentDate = new Date();
  
  let yearsSince = currentDate.getFullYear() - regDate.getFullYear();
  const monthDiff = currentDate.getMonth() - regDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < regDate.getDate())) {
    yearsSince--;
  }
  
  const startYear = regDate.getFullYear() + yearsSince;
  return `${startYear}-${startYear + 1}`;
};

// 📌 Get Finance Dashboard Overview
router.get(
  "/overview",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const subscriptionYear = `${currentYear}-${currentYear + 1}`;

      const totalMembers = await User.countDocuments({ status: "active" });

      const payments = await Payment.find({ 
        paymentType: "Annual Subscription"
      });

      const currentYearPayments = payments.filter(p => 
        p.subscriptionYear === subscriptionYear || 
        new Date(p.dueDate).getFullYear() === currentYear
      );

      const totalRevenue = payments
        .filter((p) => p.status === "Paid")
        .reduce((sum, p) => sum + p.amount, 0);

      const pendingPayments = payments.filter(
        (p) => p.status === "Pending" || p.status === "Overdue"
      );
      
      const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
      const paidCount = currentYearPayments.filter((p) => p.status === "Paid").length;
      const pendingCount = pendingPayments.length;
      const overdueCount = pendingPayments.filter(p => p.status === "Overdue").length;

      const collectionRate = totalMembers > 0 
        ? ((paidCount / totalMembers) * 100).toFixed(2) 
        : 0;

      const zoneStats = await Payment.aggregate([
        { 
          $match: { 
            paymentType: "Annual Subscription"
          } 
        },
        {
          $group: {
            _id: "$zone",
            totalAmount: { $sum: "$amount" },
            paidAmount: {
              $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$amount", 0] },
            },
            pendingAmount: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$status", "Pending"] },
                      { $eq: ["$status", "Overdue"] },
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            paidCount: {
              $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 1, 0] }
            },
            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$status", "Pending"] },
                      { $eq: ["$status", "Overdue"] },
                    ],
                  },
                  1,
                  0,
                ]
              }
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } }
      ]);

      const recentTransactions = await Payment.find({ 
        status: "Paid",
        paymentType: "Annual Subscription" 
      })
        .sort({ paidDate: -1 })
        .limit(10)
        .select("memberName itsNumber amount paidDate paymentMethod zone subscriptionYear");

      res.json({
        overview: {
          totalMembers,
          totalRevenue,
          pendingAmount,
          paidCount,
          pendingCount,
          overdueCount,
          collectionRate,
          subscriptionYear,
        },
        zoneStats,
        recentTransactions,
      });
    } catch (err) {
      console.error("Finance overview error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Get all members with their payment status
router.get(
  "/members-with-dues",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { zone, search, role } = req.query;
      
      // Build query for users
      let userQuery = { 
        status: "active"
      };
      
      if (zone && zone !== "All") {
        userQuery.zone = zone;
      }
      
      if (role && role !== "All") {
        userQuery.role = role;
      }
      
      if (search) {
        userQuery.$or = [
          { name: { $regex: search, $options: "i" } },
          { surname: { $regex: search, $options: "i" } },
          { itsNumber: { $regex: search, $options: "i" } },
        ];
      }
      
      const members = await User.find(userQuery)
        .select("name surname email mobile itsNumber zone role designation createdAt")
        .sort({ name: 1 });
      
      const payments = await Payment.find({})
        .select("memberId amount status paymentType subscriptionYear dueDate paidDate");
      
      const membersWithDues = members.map(member => {
        const memberPayments = payments.filter(
          p => p.memberId.toString() === member._id.toString()
        );
        
        const pendingPayments = memberPayments.filter(
          p => p.status === "Pending" || p.status === "Overdue"
        );
        
        const paidPayments = memberPayments.filter(
          p => p.status === "Paid"
        );
        
        const totalDue = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
        
        return {
          _id: member._id,
          name: member.name,
          surname: member.surname,
          email: member.email,
          mobile: member.mobile,
          itsNumber: member.itsNumber,
          zone: member.zone,
          role: member.role,
          designation: member.designation,
          createdAt: member.createdAt,
          totalDue,
          totalPaid,
          pendingCount: pendingPayments.length,
          paidCount: paidPayments.length,
          payments: memberPayments,
          hasPendingDues: pendingPayments.length > 0
        };
      });
      
      res.json(membersWithDues);
    } catch (err) {
      console.error("Get members with dues error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);
// routes/finance.js me ye route add karo (line ~220 ke baad)

// 🔌 Get specific member's payment history (for viewing other member profiles)
router.get(
  "/member-payments/:memberId",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      
      const payments = await Payment.find({ memberId })
        .sort({ createdAt: -1 })
        .populate("recordedBy", "name surname");
      
      // Calculate summary
      const summary = {
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0
      };
      
      payments.forEach(payment => {
        if (payment.status === "Paid") {
          summary.totalPaid += payment.amount;
          summary.paidCount++;
        } else if (payment.status === "Overdue") {
          summary.totalOverdue += payment.amount;
          summary.overdueCount++;
        } else if (payment.status === "Pending") {
          summary.totalPending += payment.amount;
          summary.pendingCount++;
        }
      });
      
      res.json({
        payments,
        summary
      });
    } catch (err) {
      console.error("Get member payments error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);
// 📌 Get all members with pending dues
router.get(
  "/pending-dues",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { zone, search } = req.query;
      
      let query = {
        status: { $in: ["Pending", "Overdue"] }
      };
      
      if (zone && zone !== "All") {
        query.zone = zone;
      }
      
      if (search) {
        query.$or = [
          { memberName: { $regex: search, $options: "i" } },
          { itsNumber: { $regex: search, $options: "i" } },
        ];
      }
      
      const pendingDues = await Payment.find(query)
        .populate("memberId", "name surname email mobile zone status")
        .sort({ dueDate: 1 });
      
      res.json(pendingDues);
    } catch (err) {
      console.error("Get pending dues error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Get all payments with filters
router.get(
  "/payments",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { status, zone, subscriptionYear, paymentType, search } = req.query;

      let query = {};

      if (status && status !== "All") query.status = status;
      if (zone && zone !== "All") query.zone = zone;
      if (subscriptionYear && subscriptionYear !== "All") query.subscriptionYear = subscriptionYear;
      if (paymentType && paymentType !== "All") query.paymentType = paymentType;
      
      if (search) {
        query.$or = [
          { memberName: { $regex: search, $options: "i" } },
          { itsNumber: { $regex: search, $options: "i" } },
        ];
      }

      const payments = await Payment.find(query)
        .populate("memberId", "name surname email mobile status")
        .populate("recordedBy", "name surname")
        .sort({ createdAt: -1 });

      res.json(payments);
    } catch (err) {
      console.error("Get payments error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Get member's own payment history (for profile page)
router.get(
  "/my-payments",
  auth,
  async (req, res) => {
    try {
      const memberId = req.user.id; // From JWT token
      
      const payments = await Payment.find({ memberId })
        .sort({ createdAt: -1 })
        .populate("recordedBy", "name surname");
      
      // Calculate summary
      const summary = {
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0
      };
      
      payments.forEach(payment => {
        if (payment.status === "Paid") {
          summary.totalPaid += payment.amount;
          summary.paidCount++;
        } else if (payment.status === "Overdue") {
          summary.totalOverdue += payment.amount;
          summary.overdueCount++;
        } else if (payment.status === "Pending") {
          summary.totalPending += payment.amount;
          summary.pendingCount++;
        }
      });
      
      res.json({
        payments,
        summary
      });
    } catch (err) {
      console.error("Get my payments error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Bulk assign dues to selected members
router.post(
  "/bulk-dues",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { memberIds, amount, remarks } = req.body;

      if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ msg: "No members selected" });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ msg: "Invalid amount" });
      }

      const results = {
        success: [],
        failed: []
      };

      for (const memberId of memberIds) {
        try {
          const member = await User.findById(memberId);
          
          if (!member) {
            results.failed.push({ memberId, reason: "Member not found" });
            continue;
          }

          const subscriptionYear = calculateSubscriptionYear(member.createdAt);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

          const payment = new Payment({
            memberId: member._id,
            memberName: `${member.name} ${member.surname}`,
            itsNumber: member.itsNumber,
            zone: member.zone,
            amount: Number(amount),
            paymentType: "Annual Subscription",
            status: "Pending",
            subscriptionYear,
            dueDate,
            remarks: remarks || "",
            recordedBy: req.user.id,
            autoGenerated: false
          });

          await payment.save();

          results.success.push({
            memberId,
            memberName: `${member.name} ${member.surname}`,
            paymentId: payment._id
          });

        } catch (err) {
          results.failed.push({ 
            memberId, 
            reason: err.message 
          });
        }
      }

      res.json({
        msg: `Successfully assigned ${results.success.length} dues`,
        results
      });

    } catch (err) {
      console.error("Bulk dues error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Bulk mark as paid
router.post(
  "/bulk-mark-paid",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { paymentIds, paymentMethod, transactionId, remarks } = req.body;
      
      if (!paymentIds || paymentIds.length === 0) {
        return res.status(400).json({ msg: "Please select at least one payment" });
      }
      
      const results = {
        success: [],
        failed: []
      };
      
      for (const paymentId of paymentIds) {
        try {
          const payment = await Payment.findById(paymentId);
          
          if (!payment) {
            results.failed.push({ paymentId, reason: "Payment not found" });
            continue;
          }
          
          // Update payment
          payment.status = "Paid";
          payment.paidDate = new Date();
          payment.paymentMethod = paymentMethod || "Cash";
          payment.transactionId = transactionId || "";
          
          if (remarks) {
            payment.remarks = remarks;
          }
          
          if (!payment.receiptNumber) {
            payment.receiptNumber = `RCP${Date.now()}${Math.floor(Math.random() * 1000)}`;
          }
          
          await payment.save();
          
          results.success.push({
            paymentId,
            memberName: payment.memberName,
            receiptNumber: payment.receiptNumber
          });
          
        } catch (err) {
          results.failed.push({ 
            paymentId, 
            reason: err.message 
          });
        }
      }
      
      res.json({
        message: `Successfully marked ${results.success.length} payments as paid`,
        results
      });
      
    } catch (err) {
      console.error("Bulk mark paid error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Update payment (individual)
router.put(
  "/payments/:id",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.status === "Paid") {
        if (!updates.paidDate) {
          updates.paidDate = new Date();
        }
        if (!updates.receiptNumber) {
          updates.receiptNumber = `RCP${Date.now()}${Math.floor(Math.random() * 1000)}`;
        }
      }

      const payment = await Payment.findByIdAndUpdate(id, updates, {
        new: true,
      }).populate("memberId", "name surname email mobile");

      if (!payment) return res.status(404).json({ msg: "Payment not found" });

      res.json({ msg: "Payment updated successfully", payment });
    } catch (err) {
      console.error("Update payment error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 📌 Auto-generate annual subscription dues
router.post(
  "/generate-annual-dues",
  auth,
  allowRoles("SuperAdmin", "Admin", "Finance"),
  async (req, res) => {
    try {
      const { amount = 3000 } = req.body;
      
      const members = await User.find({ role: "Member", status: "active" });
      
      const results = {
        processed: 0,
        created: 0,
        skipped: 0,
        errors: []
      };
      
      for (const member of members) {
        try {
          const registrationDate = new Date(member.createdAt);
          const currentDate = new Date();
          
          const oneYearAgo = new Date(currentDate);
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          
          if (registrationDate > oneYearAgo) {
            results.skipped++;
            continue;
          }
          
          const subscriptionYear = calculateSubscriptionYear(member.createdAt);
          
          const existingPayment = await Payment.findOne({
            memberId: member._id,
            paymentType: "Annual Subscription",
            subscriptionYear
          });
          
          if (existingPayment) {
            results.skipped++;
            continue;
          }
          
          const dueDate = new Date(registrationDate);
          dueDate.setFullYear(currentDate.getFullYear());
          dueDate.setDate(dueDate.getDate() + 30);
          
          const payment = new Payment({
            memberId: member._id,
            memberName: `${member.name} ${member.surname}`,
            itsNumber: member.itsNumber,
            zone: member.zone,
            amount,
            paymentType: "Annual Subscription",
            status: currentDate > dueDate ? "Overdue" : "Pending",
            subscriptionYear,
            dueDate,
            recordedBy: req.user.id,
            autoGenerated: true
          });
          
          await payment.save();
          results.created++;
          
        } catch (err) {
          results.errors.push({
            memberId: member._id,
            itsNumber: member.itsNumber,
            error: err.message
          });
        }
        
        results.processed++;
      }
      
      res.json({
        message: "Annual dues generation completed",
        results
      });
      
    } catch (err) {
      console.error("Generate annual dues error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

export default router;